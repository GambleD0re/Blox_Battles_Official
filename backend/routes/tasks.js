// backend/cron-tasks.js
// This file is dedicated to being run by the Render Cron Job service.

require('dotenv').config();
const db = require('./database/database');

const DUEL_EXPIRATION_HOURS = 1;
const DUEL_FORFEIT_MINUTES = 10;

// This is the same function from your server.js, now isolated for the cron job.
async function runScheduledTasks() {
    console.log(`[CRON] Running scheduled tasks at ${new Date().toISOString()}`);
    const pool = db.getPool();
    
    // Task 1: Cancel old 'accepted' duels
    const client1 = await pool.connect();
    try {
        const acceptedSql = `
            SELECT id, challenger_id, opponent_id, pot 
            FROM duels 
            WHERE status = 'accepted' AND accepted_at <= NOW() - INTERVAL '${DUEL_EXPIRATION_HOURS} hours'
        `;
        const { rows: expiredAcceptedDuels } = await client1.query(acceptedSql);
        for (const duel of expiredAcceptedDuels) {
            const clientTx = await pool.connect();
            try {
                await clientTx.query('BEGIN');
                const refundAmount = duel.pot / 2;
                await clientTx.query('UPDATE users SET gems = gems + $1 WHERE id = $2', [refundAmount, duel.challenger_id]);
                await clientTx.query('UPDATE users SET gems = gems + $1 WHERE id = $2', [refundAmount, duel.opponent_id]);
                await clientTx.query("UPDATE duels SET status = 'canceled' WHERE id = $1", [duel.id]);
                await clientTx.query('COMMIT');
                console.log(`[CRON] Canceled expired 'accepted' duel ID ${duel.id}. Pot of ${duel.pot} refunded.`);
            } catch (txError) {
                await clientTx.query('ROLLBACK');
                console.error(`[CRON] Rolled back transaction for duel ${duel.id}:`, txError);
            } finally {
                clientTx.release();
            }
        }
    } catch (error) {
        console.error('[CRON] Error canceling old accepted duels:', error);
    } finally {
        client1.release();
    }
    
    // Task 2 can be added here following the same pattern.
    // To keep it simple, we'll focus on the first task for now.
    console.log('[CRON] Finished scheduled tasks.');
}

// Run the tasks and then exit, as Render expects the cron command to terminate.
runScheduledTasks()
    .then(() => {
        console.log("Cron job finished successfully.");
        process.exit(0);
    })
    .catch(err => {
        console.error("Cron job failed:", err);
        process.exit(1);
    });
