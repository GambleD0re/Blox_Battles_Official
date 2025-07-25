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
                if (!txReceipt || !txReceipt.blockNumber) {
                    // Release client if we are skipping this iteration
                    client.release();
                    continue;
                }

                if (txReceipt.status === 0) {
                    await client.query("UPDATE crypto_deposits SET status = 'failed' WHERE id = $1", [deposit.id]);
                    // Release client after the update
                    client.release();
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
                // Ensure rollback is attempted only if a transaction might have started
                if (error.message.includes("Could not fetch a valid price")) {
                     await client.query('ROLLBACK');
                }
                console.error(`[Confirmer] Error processing deposit ID ${deposit.id} (TX: ${deposit.tx_hash}):`, error);
            } finally {
                // Always release the client
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

module.exports = { startConfirmationService };
