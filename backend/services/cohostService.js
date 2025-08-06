// backend/services/cohostService.js
const db = require('../database/database');

const TIER_UPTIME_MILESTONES = {
    2: 40 * 3600,  // 40 hours to reach Tier 2
    1: 120 * 3600, // 120 hours to reach Tier 1
};
const TIER_RATES = { 1: 0.50, 2: 1/3, 3: 0.25 };
const COHOST_TAX_RATE = 0.10; // 10% platform fee on co-host earnings.
const PENALTY_FINE_RATE = 0.50; // 50% fine
const BAN_DURATION_DAYS = 7;

/**
 * [NEW] Calculates and awards a co-host their share of a duel's tax.
 * This is the new, server-authoritative method for crediting co-hosts.
 * @param {number} duelId The ID of the completed duel.
 * @param {object} client An active node-postgres client.
 */
async function creditCohostForDuel(duelId, client) {
    console.log(`[COHOST_SERVICE] Checking for co-host credit for duel: ${duelId}`);
    const { rows: [duel] } = await client.query("SELECT assigned_server_id, tax_collected FROM duels WHERE id = $1", [duelId]);

    // Check if the assigned_server_id is a UUID, which indicates a co-host contract.
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!duel || !duel.assigned_server_id || !isUUID.test(duel.assigned_server_id)) {
        console.log(`[COHOST_SERVICE] Duel ${duelId} was not on a co-host server. No credit processed.`);
        return;
    }
    const contractId = duel.assigned_server_id;

    try {
        const { rows: [contract] } = await client.query("SELECT claimed_by_user_id FROM host_contracts WHERE id = $1", [contractId]);
        if (!contract || !contract.claimed_by_user_id) {
            throw new Error(`Contract ${contractId} not found or not claimed.`);
        }

        const userId = contract.claimed_by_user_id;
        const { rows: [cohost] } = await client.query("SELECT reliability_tier FROM co_hosts WHERE user_id = $1", [userId]);
        if (!cohost) {
            throw new Error(`Co-host data not found for user ${userId}`);
        }
        
        const rate = TIER_RATES[cohost.reliability_tier] || TIER_RATES[3];
        const grossShare = Math.floor(duel.tax_collected * rate);
        const taxOnShare = Math.floor(grossShare * COHOST_TAX_RATE);
        const netShare = grossShare - taxOnShare;
        
        if (netShare > 0) {
            await client.query("UPDATE host_contracts SET gems_earned = gems_earned + $1 WHERE id = $2", [netShare, contractId]);
            console.log(`[COHOST_SERVICE] Credited co-host ${userId} with ${netShare} gems for duel ${duelId} on contract ${contractId}.`);
        }
    } catch (error) {
        // We catch the error but don't re-throw to avoid halting the parent transaction (e.g., duel finalization).
        console.error(`[COHOST_SERVICE] CRITICAL: Failed to credit co-host for duel ${duelId}. Error:`, error);
    }
}


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
    creditCohostForDuel,
    TIER_UPTIME_MILESTONES
};
