// backend/services/transactionListenerService.js
const { Alchemy, Network, AlchemySubscription } = require("alchemy-sdk");
const { ethers } = require("ethers");
// [CORRECTED] This path now correctly points up one level and into the database folder.
const db = require('../database/database');

const alchemySettings = {
    apiKey: process.env.ALCHEMY_API_KEY,
    network: Network.MATIC_MAINNET,
};
const alchemy = new Alchemy(alchemySettings);

const SUPPORTED_TOKENS = {
    'POL': { contractAddress: null, decimals: 18 },
    'USDC': { contractAddress: '0x3c499c542cef5e3811e1192ce70d8cc03d5c3359', decimals: 6 },
    'USDT': { contractAddress: '0xc2132d05d31c914a87c6611c10748aeb04b58e8f', decimals: 6 }
};

let monitoredAddresses = new Set();

async function loadMonitoredAddresses() {
    try {
        const { rows: users } = await db.query('SELECT crypto_deposit_address FROM users WHERE crypto_deposit_address IS NOT NULL');
        const addresses = users.map(u => u.crypto_deposit_address.toLowerCase());
        monitoredAddresses = new Set(addresses);
        console.log(`[Listener] Monitoring ${monitoredAddresses.size} user deposit addresses.`);
    } catch (error) {
        console.error("[Listener] Error loading addresses from database:", error);
    }
}

async function handleDetectedTransaction({ hash, to, tokenType, value }) {
    const toAddress = to.toLowerCase();
    if (!monitoredAddresses.has(toAddress)) return;

    try {
        const { rows: [user] } = await db.query('SELECT id FROM users WHERE crypto_deposit_address = $1', [toAddress]);
        if (!user) {
            console.warn(`[Listener] Detected transaction to an unassociated address: ${toAddress}`);
            return;
        }

        const { rows: [existingDeposit] } = await db.query('SELECT id FROM crypto_deposits WHERE tx_hash = $1', [hash]);
        if (existingDeposit) {
            console.log(`[Listener] Ignoring duplicate transaction: ${hash}`);
            return;
        }

        const tokenConfig = SUPPORTED_TOKENS[tokenType];
        const amountCrypto = parseFloat(ethers.formatUnits(value, tokenConfig.decimals));

        console.log(`[Listener] Detected pending deposit: ${amountCrypto} ${tokenType} to user ${user.id} (TX: ${hash})`);

        await db.query(
            `INSERT INTO crypto_deposits (user_id, tx_hash, token_type, amount_crypto, gem_package_id, gem_amount, status)
             VALUES ($1, $2, $3, $4, $5, $6, 'pending')`,
            [user.id, hash, tokenType, amountCrypto, 'crypto_placeholder', 0]
        );

    } catch (error) {
        if (error.code === '23505') {
             console.log(`[Listener] Ignoring duplicate transaction via race condition: ${hash}`);
        } else {
             console.error(`[Listener] Error handling transaction ${hash}:`, error);
        }
    }
}

function startTransactionListener() {
    console.log("[Listener] Starting WebSocket transaction listeners...");
    loadMonitoredAddresses();

    alchemy.ws.on(AlchemySubscription.PENDING_TRANSACTIONS, (tx) => {
        if (tx.to && monitoredAddresses.has(tx.to.toLowerCase()) && tx.data === '0x') {
             handleDetectedTransaction({ hash: tx.hash, to: tx.to, tokenType: 'POL', value: tx.value });
        }
    });
    console.log("[Listener] Native POL transfer listener is active.");

    const erc20TransferFilter = {
        method: AlchemySubscription.PENDING_TRANSACTIONS,
        toAddress: [SUPPORTED_TOKENS.USDC.contractAddress, SUPPORTED_TOKENS.USDT.contractAddress],
        hashesOnly: false
    };

    alchemy.ws.on(erc20TransferFilter, (tx) => {
        const iface = new ethers.Interface(["function transfer(address to, uint256 amount)"]);
        try {
            const decodedData = iface.parseTransaction({ data: tx.data, value: tx.value });
            if (decodedData && decodedData.name === 'transfer') {
                const recipientAddress = decodedData.args.to.toLowerCase();
                if (monitoredAddresses.has(recipientAddress)) {
                    const tokenType = tx.to.toLowerCase() === SUPPORTED_TOKENS.USDC.contractAddress ? 'USDC' : 'USDT';
                    handleDetectedTransaction({ hash: tx.hash, to: recipientAddress, tokenType: tokenType, value: decodedData.args.amount });
                }
            }
        } catch (e) { /* Ignore non-transfer transactions */ }
    });
    console.log("[Listener] ERC-20 (USDC/USDT) transfer listener is active.");
}

function addAddressToMonitor(address) {
    const lowerCaseAddress = address.toLowerCase();
    if (address && !monitoredAddresses.has(lowerCaseAddress)) {
        monitoredAddresses.add(lowerCaseAddress);
        console.log(`[Listener] Added new address to live monitor: ${lowerCaseAddress}. Total: ${monitoredAddresses.size}`);
    }
}

module.exports = { startTransactionListener, addAddressToMonitor };
