// backend/routes/logs.js
const express = require('express');
const db = require('../database/database');
const { body, validationResult } = require('express-validator');
const { authenticateBot } = require('../middleware/auth');

const router = express.Router();

// A helper function to decrement a server's player count.
const decrementPlayerCount = async (client, duelId) => {
    try {
        const { rows: [duel] } = await client.query('SELECT assigned_server_id FROM duels WHERE id = $1', [duelId]);
        if (duel && duel.assigned_server_id) {
            await client.query('UPDATE game_servers SET player_count = GREATEST(0, player_count - 2) WHERE server_id = $1', [duel.assigned_server_id]);
            console.log(`[PlayerCount] Decremented player count for server ${duel.assigned_server_id} from duel ${duelId}.`);
        }
    } catch (err) {
        console.error(`[PlayerCount] Failed to decrement player count for duel ${duelId}:`, err);
        // Do not throw, as this should not block the main logic.
    }
};

// Endpoint for the bot to post duel logs
router.post('/', 
    authenticateBot, 
    body().isArray().withMessage('Request body must be an array of events.'),
    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const events = req.body;

        for (const event of events) {
            if (!event.duelId || !event.eventType) {
                console.warn("Skipping malformed log event:", event);
                continue;
            }

            const client = await db.getPool().connect();
            try {
                await client.query('BEGIN');
                
                const websiteDuelId = event.duelId;

                if (event.eventType === 'DUEL_STARTED') {
                    console.log(`Received DUEL_STARTED event for duel ${websiteDuelId}. Appending to transcript.`);
                }
                
                const { rows: [duel] } = await client.query('SELECT id, transcript, status FROM duels WHERE id = $1 FOR UPDATE', [websiteDuelId]);
                
                if (duel) {
                    let transcript = duel.transcript || [];
                    transcript.push(event);
                    // [MODIFIED] Update last_activity_at whenever a new log comes in. This keeps the duel "alive".
                    await client.query('UPDATE duels SET transcript = $1, last_activity_at = NOW() WHERE id = $2', [JSON.stringify(transcript), duel.id]);

                    if (event.eventType === 'PARSED_DUEL_ENDED') {
                        if (duel.status === 'started' || duel.status === 'under_review') {
                            const { winner_username } = event.data;
                            if (winner_username) {
                                const { rows: [winnerUser] } = await client.query('SELECT id FROM users WHERE linked_roblox_username = $1', [winner_username]);
                                if (winnerUser) {
                                    await client.query("UPDATE duels SET status = 'completed_unseen', winner_id = $1 WHERE id = $2", [winnerUser.id, duel.id]);
                                    console.log(`Duel ${duel.id} result recorded. Winner: ${winner_username}.`);
                                } else {
                                    await client.query("UPDATE duels SET status = 'canceled' WHERE id = $1", [duel.id]);
                                }
                            } else {
                                await client.query("UPDATE duels SET status = 'canceled' WHERE id = $1", [duel.id]);
                            }
                            await decrementPlayerCount(client, duel.id);
                        }
                    }
                } else {
                    console.warn(`Received log for an unknown website_duel_id: ${websiteDuelId}`);
                }
                
                await client.query('COMMIT');
            } catch (innerErr) {
                await client.query('ROLLBACK');
                console.error(`Error processing log event for duelId ${event.duelId}:`, innerErr.message);
            } finally {
                client.release();
            }
        }
        res.status(200).json({ message: 'Log batch received and processed successfully.' });
    }
);

module.exports = router;
