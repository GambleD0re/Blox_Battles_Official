// backend/cron-tasks.js
// This file contains all scheduled tasks and is executed by the Render Cron Job service.

require('dotenv').config({ path: require('path').resolve(__dirname, './.env') });
const db = require('./database/database');

const DUEL_EXPIRATION_HOURS = 1;
const DUEL_FORFEIT_MINUTES = 10;
const DUEL_INACTIVITY_MINUTES = 3; // [NEW] Inactivity threshold

// A helper function to decrement a server's player count.
const decrementPlayerCount = async (client, duelId) => {
    try {
        const { rows: [duel] } = await client.query('SELECT assigned_server_id FROM duels WHERE id = $1', [duelId]);
        if (duel && duel.assigned_server_id) {
            await client.query('UPDATE game_servers SET player_count = GREATEST(0, player_count - 2) WHERE server_id = $1', [duel.assigned_server_id]);
            console.log(`[PlayerCount][CRON] Decremented player count for server ${duel.assigned_server_id} from duel ${duelId}.`);
        }
    } catch (err) {
        console.error(`[PlayerCount][CRON] Failed to decrement player count for duel ${duelId}:`, err);
    }
};

async function runScheduledTasks() {
    console.log(`[CRON] Running scheduled tasks at ${new Date().toISOString()}`);
    const pool = db.getPool();

    // --- Task 1: Cancel old 'accepted' duels that were never started ---
    const expirationClient = await pool.connect();
    try {
        const acceptedSql = `
            SELECT id, challenger_id, opponent_id, wager 
            FROM duels 
            WHERE status = 'accepted' AND accepted_at <= NOW() - INTERVAL '${DUEL_EXPIRATION_HOURS} hours'
        `;
        const { rows: expiredAcceptedDuels } = await expirationClient.query(acceptedSql);

        for (const duel of expiredAcceptedDuels) {
            const txClient = await pool.connect();
            try {
                await txClient.query('BEGIN');
                const refundAmount = parseInt(duel.wager);
                await txClient.query('UPDATE users SET gems = gems + $1 WHERE id = $2', [refundAmount, duel.challenger_id]);
                await txClient.query('UPDATE users SET gems = gems + $1 WHERE id = $2', [refundAmount, duel.opponent_id]);
                await txClient.query("UPDATE duels SET status = 'canceled' WHERE id = $1", [duel.id]);
                
                await txClient.query('COMMIT');
                console.log(`[CRON] Canceled expired 'accepted' duel ID ${duel.id}. Wager of ${duel.wager} refunded to each player.`);
            } catch (txError) {
                await txClient.query('ROLLBACK');
                console.error(`[CRON] Rolled back transaction for expiration of duel ${duel.id}:`, txError);
            } finally {
                txClient.release();
            }
        }
    } catch (error) {
        console.error('[CRON] Error querying for old accepted duels:', error);
    } finally {
        expirationClient.release();
    }

    // --- Task 2: Handle 'started' duels that timed out (forfeit logic) ---
    const forfeitClient = await pool.connect();
    try {
        // [MODIFIED] The query now also checks for inactivity.
        const startedSql = `
            SELECT id, challenger_id, opponent_id, pot, wager, transcript, tax_collected 
            FROM duels 
            WHERE status = 'started' 
              AND started_at <= NOW() - INTERVAL '${DUEL_FORFEIT_MINUTES} minutes'
              AND last_activity_at <= NOW() - INTERVAL '${DUEL_INACTIVITY_MINUTES} minutes'
        `;
        const { rows: expiredStartedDuels } = await forfeitClient.query(startedSql);

        for (const duel of expiredStartedDuels) {
            const txClient = await pool.connect();
            try {
                await txClient.query('BEGIN');
                const { rows: [challenger] } = await txClient.query('SELECT id, linked_roblox_username FROM users WHERE id = $1', [duel.challenger_id]);
                const { rows: [opponent] } = await txClient.query('SELECT id, linked_roblox_username FROM users WHERE id = $1', [duel.opponent_id]);

                const transcript = duel.transcript || [];
                const joinedPlayers = new Set(
                    transcript
                        .filter(event => event.eventType === 'PLAYER_JOINED_DUEL' && event.data?.playerName)
                        .map(event => event.data.playerName)
                );

                const challengerJoined = joinedPlayers.has(challenger.linked_roblox_username);
                const opponentJoined = joinedPlayers.has(opponent.linked_roblox_username);

                if (!challengerJoined && !opponentJoined) {
                    let adjustedTax = parseInt(duel.tax_collected);
                    if (adjustedTax % 2 !== 0) {
                        adjustedTax++;
                    }
                    await txClient.query('UPDATE duels SET tax_collected = $1 WHERE id = $2', [adjustedTax, duel.id]);
                    const refundAmount = parseInt(duel.wager) - (adjustedTax / 2);
                    
                    await txClient.query('UPDATE users SET gems = gems + $1 WHERE id = $2', [refundAmount, duel.challenger_id]);
                    await txClient.query('UPDATE users SET gems = gems + $1 WHERE id = $2', [refundAmount, duel.opponent_id]);
                    await txClient.query("UPDATE duels SET status = 'canceled', winner_id = NULL WHERE id = $1", [duel.id]);
                    await decrementPlayerCount(txClient, duel.id);
                    console.log(`[CRON] Duel ID ${duel.id} canceled (no-show from both). Tax of ${adjustedTax} applied. Refunded ${refundAmount} to each player.`);
                } 
                else if (challengerJoined && !opponentJoined) {
                    await txClient.query('UPDATE users SET gems = gems + $1, wins = wins + 1 WHERE id = $2', [duel.pot, duel.challenger_id]);
                    await txClient.query('UPDATE users SET losses = losses + 1 WHERE id = $1', [duel.opponent_id]);
                    await txClient.query("UPDATE duels SET status = 'completed', winner_id = $1 WHERE id = $2", [duel.challenger_id, duel.id]);
                    await decrementPlayerCount(txClient, duel.id);
                    console.log(`[CRON] Duel ID ${duel.id} forfeited by ${opponent.linked_roblox_username}.`);
                } 
                else if (!challengerJoined && opponentJoined) {
                    await txClient.query('UPDATE users SET gems = gems + $1, wins = wins + 1 WHERE id = $2', [duel.pot, duel.opponent_id]);
                    await txClient.query('UPDATE users SET losses = losses + 1 WHERE id = $1', [duel.challenger_id]);
                    await txClient.query("UPDATE duels SET status = 'completed', winner_id = $1 WHERE id = $2", [duel.opponent_id, duel.id]);
                    await decrementPlayerCount(txClient, duel.id);
                    console.log(`[CRON] Duel ID ${duel.id} forfeited by ${challenger.linked_roblox_username}.`);
                }
                else {
                    console.log(`[CRON] Duel ID ${duel.id} timed out after both players joined. Voiding with tax.`);
                    
                    let adjustedTax = parseInt(duel.tax_collected);
                    if (adjustedTax % 2 !== 0) {
                        adjustedTax++;
                    }
                    await txClient.query('UPDATE duels SET tax_collected = $1 WHERE id = $2', [adjustedTax, duel.id]);
                    const refundAmount = parseInt(duel.wager) - (adjustedTax / 2);
                    
                    await txClient.query('UPDATE users SET gems = gems + $1 WHERE id = $2', [refundAmount, duel.challenger_id]);
                    await txClient.query('UPDATE users SET gems = gems + $1 WHERE id = $2', [refundAmount, duel.opponent_id]);
                    await txClient.query("UPDATE duels SET status = 'canceled', winner_id = NULL WHERE id = $1", [duel.id]);
                    await decrementPlayerCount(txClient, duel.id);
                    console.log(`[CRON] Duel ID ${duel.id} voided. Tax of ${adjustedTax} applied. Refunded ${refundAmount} to each player.`);
                }

                await txClient.query('COMMIT');
            } catch (err) {
                await txClient.query('ROLLBACK');
                console.error(`[CRON] Error processing forfeit for duel ID ${duel.id}:`, err);
            } finally {
                txClient.release();
            }
        }
    } catch (error) {
        console.error('[CRON] Error querying for timed-out started duels:', error);
    } finally {
        forfeitClient.release();
    }
}

// Run the tasks and then exit, as Render expects the cron command to terminate.
runScheduledTasks()
    .then(() => {
        console.log("[CRON] Scheduled tasks finished successfully.");
        process.exit(0);
    })
    .catch(err => {
        console.error("[CRON] Scheduled tasks failed:", err);
        process.exit(1);
    });
