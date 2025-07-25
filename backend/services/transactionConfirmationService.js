// backend/services/transactionConfirmationService.js
const { Alchemy, Network } = require("alchemy-sdk");
const db = require('../database/database');
const { getLatestPrice } = require('./priceFeedService');

const CONFIRMATION_CHECK_INTERVAL = 60 * 1000; // 60 seconds

const alchemySettings = {
    apiKey: process.env.ALCHEMY_API_KEY,
    network: Network.MATIC_MAINNET,
};
const alchemy = new Alchemy(alchemySettings);

async function getLatestBlockNumber() {
    try {
        return await alchemy.core.getBlockNumber();
    } catch (error) {
        console.error("[Confirmer] Error fetching latest block number:", error);
        return 0;
    }
}

async function processPendingDeposits() {
    console.log("[Confirmer] Checking for pending deposits...");

    try {
        const { rows: pendingDeposits } = await db.query("SELECT * FROM crypto_deposits WHERE status = 'pending'");
        if (pendingDeposits.length === 0) {
            console.log("[Confirmer] No pending deposits to process.");
            return;
        }

        const latestBlock = await getLatestBlockNumber();
        if (latestBlock === 0) return;

        for (const deposit of pendingDeposits) {
            const client = await db.getPool().connect();
            try {
                const txReceipt = await alchemy.core.getTransactionReceipt(deposit.tx_hash);
                if (!txReceipt || !txReceipt.blockNumber) continue;

                if (txReceipt.status === 0) {
                    await client.query("UPDATE crypto_deposits SET status = 'failed' WHERE id = $1", [deposit.id]);
                    continue;
                }
                
                const confirmations = latestBlock - txReceipt.blockNumber;
                if (confirmations >= deposit.required_confirmations) {
                    await client.query('BEGIN');
                    
                    const GEM_PER_DOLLAR = 100;
                    const priceSymbol = `${deposit.token_type}_USD`;
                    
                    const currentPrice = await getLatestPrice(priceSymbol);
                    if (!currentPrice || currentPrice <= 0) {
                        throw new Error(`Could not fetch a valid price for ${deposit.token_type}`);
                    }

                    const usdValue = parseFloat(deposit.amount_crypto) * currentPrice;
                    const gemsToCredit = Math.floor(usdValue * GEM_PER_DOLLAR);

                    await client.query('UPDATE users SET gems = gems + $1 WHERE id = $2', [gemsToCredit, deposit.user_id]);
                    await client.query(
                        "UPDATE crypto_deposits SET status = 'credited', credited_at = NOW(), block_number = $1, gem_amount = $2 WHERE id = $3", 
                        [txReceipt.blockNumber, gemsToCredit, deposit.id]
                    );
                    
                    await client.query('COMMIT');
                    console.log(`[Confirmer] Credited ${gemsToCredit} gems to user ${deposit.user_id} for ${deposit.amount_crypto} ${deposit.token_type}.`);
                }

            } catch (error) {
                await client.query('ROLLBACK');
                console.error(`[Confirmer] Error processing deposit ID ${deposit.id} (TX: ${deposit.tx_hash}):`, error);
            } finally {
                client.release();
            }
        }

    } catch (error) {
        console.error("[Confirmer] A critical error occurred in the main processing loop:", error);
    }
}

function startConfirmationService() {
    console.log(`[Confirmer] Starting confirmation service. Check interval: ${CONFIRMATION_CHECK_INTERVAL / 1000} seconds.`);
    processPendingDeposits();
    setInterval(processPendingDeposits, CONFIRMATION_CHECK_INTERVAL);
}

module.exports = { startConfirmationService };```

---

#### **10. `backend/services/transactionListenerService.js` (Fully Refactored)**

This service listens for incoming blockchain transactions in real-time.

```javascript
// backend/services/transactionListenerService.js
const { Alchemy, Network, AlchemySubscription } = require("alchemy-sdk");
const { ethers } = require("ethers");
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
        if (error.code === '23505') { // Handle race condition for unique tx_hash
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
