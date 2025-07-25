// backend/services/transactionListenerService.js
// This service establishes a persistent WebSocket connection to Alchemy
// to monitor the blockchain for incoming user deposits in real-time.

const { Alchemy, Network, AlchemySubscription } = require("alchemy-sdk");
const { ethers } = require("ethers");
const db = require('../database/database');

// --- Configuration ---
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

// --- Service State ---
let monitoredAddresses = new Set();

/**
 * Fetches all user deposit addresses from the database and populates the in-memory set.
 */
async function loadMonitoredAddresses() {
    try {
        const users = await db.all('SELECT crypto_deposit_address FROM users WHERE crypto_deposit_address IS NOT NULL');
        const addresses = users.map(u => u.crypto_deposit_address.toLowerCase());
        monitoredAddresses = new Set(addresses);
        console.log(`[Listener] Monitoring ${monitoredAddresses.size} user deposit addresses.`);
    } catch (error) {
        console.error("[Listener] Error loading addresses from database:", error);
    }
}

/**
 * Handles a detected transaction by creating a pending record in the database.
 */
async function handleDetectedTransaction({ hash, to, tokenType, value }) {
    const toAddress = to.toLowerCase();
    if (!monitoredAddresses.has(toAddress)) {
        return;
    }

    try {
        const user = await db.get('SELECT id FROM users WHERE crypto_deposit_address = ?', [toAddress]);
        if (!user) {
            console.warn(`[Listener] Detected transaction to an unassociated address: ${toAddress}`);
            return;
        }

        const existingDeposit = await db.get('SELECT id FROM crypto_deposits WHERE tx_hash = ?', [hash]);
        if (existingDeposit) {
            console.log(`[Listener] Ignoring duplicate transaction: ${hash}`);
            return;
        }

        const tokenConfig = SUPPORTED_TOKENS[tokenType];
        const amountCrypto = parseFloat(ethers.formatUnits(value, tokenConfig.decimals));

        console.log(`[Listener] Detected pending deposit: ${amountCrypto} ${tokenType} to user ${user.id} (TX: ${hash})`);

        await db.run(
            `INSERT INTO crypto_deposits (user_id, tx_hash, token_type, amount_crypto, gem_package_id, gem_amount, status)
             VALUES (?, ?, ?, ?, ?, ?, 'pending')`,
            [user.id, hash, tokenType, amountCrypto, 'crypto_placeholder', 0]
        );

    } catch (error) {
        console.error(`[Listener] Error handling transaction ${hash}:`, error);
    }
}


/**
 * Starts the WebSocket listeners for both native POL and ERC-20 tokens.
 */
function startTransactionListener() {
    console.log("[Listener] Starting WebSocket transaction listeners...");

    alchemy.ws.on(AlchemySubscription.PENDING_TRANSACTIONS, (tx) => {
        const toAddress = tx.to ? tx.to.toLowerCase() : null;
        if (toAddress && monitoredAddresses.has(toAddress) && tx.data === '0x') {
             handleDetectedTransaction({ hash: tx.hash, to: tx.to, tokenType: 'POL', value: tx.value });
        }
    });
    console.log("[Listener] Native POL transfer listener is active.");

    const erc20TransferFilter = {
        method: 'alchemy_pendingTransactions',
        toAddress: [SUPPORTED_TOKENS.USDC.contractAddress, SUPPORTED_TOKENS.USDT.contractAddress],
        hashesOnly: false
    };

    alchemy.ws.on(erc20TransferFilter, (tx) => {
        const iface = new ethers.Interface(["function transfer(address to, uint256 amount)"]);
        try {
            const decodedData = iface.parseTransaction({ data: tx.data });
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

/**
 * Adds a new address to the live monitoring set.
 */
function addAddressToMonitor(address) {
    const lowerCaseAddress = address.toLowerCase();
    if (address && !monitoredAddresses.has(lowerCaseAddress)) {
        monitoredAddresses.add(lowerCaseAddress);
        console.log(`[Listener] Added new address to live monitor: ${lowerCaseAddress}. Total: ${monitoredAddresses.size}`);
    }
}


// Initial load of addresses when the service starts.
loadMonitoredAddresses();

module.exports = {
    startTransactionListener,
    addAddressToMonitor
};