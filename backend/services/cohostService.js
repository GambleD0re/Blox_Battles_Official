// backend/services/cohostService.js
const db = require('../database/database');

const TIER_UPTIME_MILESTONES = {
    2: 40 * 3600,  // 40 hours to reach Tier 2
    1: 120 * 3600, // 120 hours to reach Tier 1
};

const PENALTY_FINE_RATE = 0.50; // 50% fine
const BAN_DURATION_DAYS = 7;

async function processPenalty(contractId) {
    console.log(`[COHOST_SERVICE] Processing penalty for crashed contract: ${contractId}`);
    const client = await db.getPool().connect();
    try {
        await client.query('BEGIN');
        const { rows: [contract] } = await client.query("SELECT * FROM host_contracts WHERE id = $1", [contractId]);
        if (!contract || !contract.claimed_by_user_id) {
            throw new Error("Contract not found or not claimed.");
        }
        const userId = contract.claimed_by_user_id;
        const { rows: [cohost] } = await client.query("SELECT * FROM co_hosts WHERE user_id = $1 FOR UPDATE", [userId]);
        if (!cohost) {
            throw new Error(`Co-host data not found for user ${userId}`);
        }

        const fineAmount = Math.floor(contract.gems_earned * PENALTY_FINE_RATE);
        if (fineAmount > 0) {
            await client.query("UPDATE users SET gems = gems - $1 WHERE id = $2", [fineAmount, userId]);
            await client.query(
                `INSERT INTO transaction_history (user_id, type, amount_gems, description, reference_id) VALUES ($1, 'cohost_penalty', $2, $3, $4)`,
                [userId, -fineAmount, `50% fine for improper shutdown of co-host session`, contractId]
            );
        }

        const currentTier = cohost.reliability_tier;
        if (currentTier === 3) {
            await client.query(`UPDATE co_hosts SET cohost_ban_until = NOW() + INTERVAL '${BAN_DURATION_DAYS} days' WHERE user_id = $1`, [userId]);
            console.log(`[COHOST_SERVICE] User ${userId} was Tier 3. Banned from co-hosting for ${BAN_DURATION_DAYS} days.`);
        } else {
            const newTier = currentTier + 1;
            await client.query("UPDATE co_hosts SET reliability_tier = $1 WHERE user_id = $2", [newTier, userId]);
            console.log(`[COHOST_SERVICE] User ${userId} demoted from Tier ${currentTier} to ${newTier}.`);
        }

        await client.query('COMMIT');
    } catch (error) {
        await client.query('ROLLBACK');
        console.error(`[COHOST_SERVICE] Failed to process penalty for contract ${contractId}:`, error);
    } finally {
        client.release();
    }
}

async function processCompletion(contractId) {
    console.log(`[COHOST_SERVICE] Processing completion for contract: ${contractId}`);
    const client = await db.getPool().connect();
    try {
        await client.query('BEGIN');
        const { rows: [contract] } = await client.query("SELECT * FROM host_contracts WHERE id = $1", [contractId]);
        if (!contract || !contract.claimed_by_user_id || !contract.start_time || !contract.end_time) {
            throw new Error("Contract data is insufficient for completion processing.");
        }
        
        const userId = contract.claimed_by_user_id;
        const sessionUptime = Math.floor((new Date(contract.end_time) - new Date(contract.start_time)) / 1000);
        
        const { rows: [cohost] } = await client.query("SELECT * FROM co_hosts WHERE user_id = $1 FOR UPDATE", [userId]);
        if (!cohost) {
            throw new Error(`Co-host data not found for user ${userId}`);
        }

        const newTotalUptime = cohost.total_uptime_seconds + sessionUptime;
        let newTier = cohost.reliability_tier;

        if (cohost.reliability_tier === 2 && newTotalUptime >= TIER_UPTIME_MILESTONES[1]) {
            newTier = 1;
        } else if (cohost.reliability_tier === 3 && newTotalUptime >= TIER_UPTIME_MILESTONES[2]) {
            newTier = 2;
        }

        await client.query("UPDATE co_hosts SET total_uptime_seconds = $1, reliability_tier = $2 WHERE user_id = $3", [newTotalUptime, newTier, userId]);
        if (newTier !== cohost.reliability_tier) {
            console.log(`[COHOST_SERVICE] User ${userId} has been promoted to Tier ${newTier}!`);
        }

        await client.query('COMMIT');
    } catch (error) {
        await client.query('ROLLBACK');
        console.error(`[COHOST_SERVICE] Failed to process completion for contract ${contractId}:`, error);
    } finally {
        client.release();
    }
}

module.exports = {
    processPenalty,
    processCompletion,
    TIER_UPTIME_MILESTONES
};
