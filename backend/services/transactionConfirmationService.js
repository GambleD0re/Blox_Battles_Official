// backend/services/transactionConfirmationService.js
// This service periodically checks for pending crypto deposits and credits the user's
// gem balance once the transaction has enough blockchain confirmations.

const { Alchemy, Network } = require("alchemy-sdk");
const db = require('../database/database');
// [NEW] Import the price feed service to get real-time crypto prices.
const { getLatestPrice } = require('./priceFeedService');

// --- Configuration ---
const CONFIRMATION_CHECK_INTERVAL = 60 * 1000; // Check every 60 seconds

const alchemySettings = {
    apiKey: process.env.ALCHEMY_API_KEY,
    network: Network.MATIC_MAINNET,
};

const alchemy = new Alchemy(alchemySettings);

/**
 * Fetches the latest block number from the blockchain.
 * @returns {Promise<number>} The latest block number.
 */
async function getLatestBlockNumber() {
    try {
        return await alchemy.core.getBlockNumber();
    } catch (error) {
        console.error("[Confirmer] Error fetching latest block number:", error);
        return 0;
    }
}

/**
 * Checks pending deposits, verifies confirmations, and credits gems to users.
 */
async function processPendingDeposits() {
    console.log("[Confirmer] Checking for pending deposits...");

    try {
        const pendingDeposits = await db.all("SELECT * FROM crypto_deposits WHERE status = 'pending'");

        if (pendingDeposits.length === 0) {
            console.log("[Confirmer] No pending deposits to process.");
            return;
        }

        const latestBlock = await getLatestBlockNumber();
        if (latestBlock === 0) {
            console.warn("[Confirmer] Could not get latest block, skipping this cycle.");
            return;
        }

        for (const deposit of pendingDeposits) {
            try {
                const txReceipt = await alchemy.core.getTransactionReceipt(deposit.tx_hash);

                if (!txReceipt || !txReceipt.blockNumber) {
                    console.log(`[Confirmer] Transaction ${deposit.tx_hash} not yet mined. Waiting.`);
                    continue;
                }

                if (txReceipt.status === 0) {
                    console.warn(`[Confirmer] Transaction ${deposit.tx_hash} failed. Marking as 'failed'.`);
                    await db.run("UPDATE crypto_deposits SET status = 'failed' WHERE id = ?", [deposit.id]);
                    continue;
                }
                
                const confirmations = latestBlock - txReceipt.blockNumber;

                if (confirmations >= deposit.required_confirmations) {
                    console.log(`[Confirmer] Transaction ${deposit.tx_hash} has ${confirmations} confirmations. Crediting user ${deposit.user_id}.`);

                    // [REWORKED] This logic now uses the price feed for accurate gem calculation.
                    await db.run('BEGIN TRANSACTION');
                    
                    const GEM_PER_DOLLAR = 100;
                    const priceSymbol = `${deposit.token_type}_USD`;
                    
                    // Fetch the real-time price of the deposited asset.
                    const currentPrice = await getLatestPrice(priceSymbol);
                    if (!currentPrice || currentPrice <= 0) {
                        throw new Error(`Could not fetch a valid price for ${deposit.token_type} to credit gems.`);
                    }

                    // Calculate the USD value of the deposit and the corresponding gem amount.
                    const usdValue = deposit.amount_crypto * currentPrice;
                    const gemsToCredit = Math.floor(usdValue * GEM_PER_DOLLAR);

                    // 1. Add gems to the user's account
                    await db.run('UPDATE users SET gems = gems + ? WHERE id = ?', [gemsToCredit, deposit.user_id]);
                    
                    // 2. Mark the deposit as credited and update the gem amount
                    await db.run(
                        "UPDATE crypto_deposits SET status = 'credited', credited_at = CURRENT_TIMESTAMP, block_number = ?, gem_amount = ? WHERE id = ?", 
                        [txReceipt.blockNumber, gemsToCredit, deposit.id]
                    );
                    
                    await db.run('COMMIT');
                    
                    console.log(`[Confirmer] Successfully credited ${gemsToCredit} gems to user ${deposit.user_id} for ${deposit.amount_crypto} ${deposit.token_type} deposit.`);
                } else {
                    console.log(`[Confirmer] Transaction ${deposit.tx_hash} has ${confirmations}/${deposit.required_confirmations} confirmations. Waiting.`);
                }

            } catch (error) {
                if (db.inTransaction) {
                    await db.run('ROLLBACK').catch(console.error);
                }
                console.error(`[Confirmer] Error processing deposit ID ${deposit.id} (TX: ${deposit.tx_hash}):`, error);
            }
        }

    } catch (error) {
        console.error("[Confirmer] A critical error occurred in the main processing loop:", error);
    }
}

/**
 * Starts the confirmation service to run at a regular interval.
 */
function startConfirmationService() {
    console.log(`[Confirmer] Starting confirmation service. Check interval: ${CONFIRMATION_CHECK_INTERVAL / 1000} seconds.`);
    processPendingDeposits();
    setInterval(processPendingDeposits, CONFIRMATION_CHECK_INTERVAL);
}

module.exports = {
    startConfirmationService
};