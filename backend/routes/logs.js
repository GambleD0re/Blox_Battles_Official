// backend/routes/logs.js
const express = require('express');
const db = require('../database/database');
const { body, validationResult } = require('express-validator');
const { authenticateBot } = require('../middleware/auth');

const router = express.Router();

// Endpoint for the bot to post duel logs
router.post('/', 
    authenticateBot, 
    body().isArray().withMessage('Request body must be an array of events.'),
    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            console.warn("Log batch validation errors:", errors.array());
            return res.status(400).json({ errors: errors.array() });
        }

        const events = req.body;

        try {
            for (const event of events) {
                if (!event.duelId || !event.eventType) {
                    console.warn("Skipping malformed log event (missing duelId or eventType):", event);
                    continue;
                }

                // Process each event in its own transaction
                const client = await db.getPool().connect();
                try {
                    await client.query('BEGIN');
                    
                    let duel = null;
                    let websiteDuelIdFromEvent = event.data ? event.data.websiteDuelId : null;

                    if (event.eventType === 'DUEL_STARTED' && websiteDuelIdFromEvent) {
                        const { rows: duelRows } = await client.query('SELECT * FROM duels WHERE id = $1', [websiteDuelIdFromEvent]);
                        duel = duelRows[0];
                        if (duel) {
                            await client.query('UPDATE duels SET bot_duel_id = $1 WHERE id = $2', [event.duelId, duel.id]);
                            console.log(`Duel ${duel.id} linked to bot_duel_id: ${event.duelId}`);
                        }
                    } else {
                        const { rows: duelRows } = await client.query('SELECT * FROM duels WHERE bot_duel_id = $1', [event.duelId]);
                        duel = duelRows[0];
                    }
                    
                    if (duel) {
                        // For JSONB columns, node-postgres automatically parses it into a JS object.
                        // We can directly manipulate it.
                        let transcript = duel.transcript || [];
                        transcript.push(event);
                        await client.query('UPDATE duels SET transcript = $1 WHERE id = $2', [JSON.stringify(transcript), duel.id]);

                        if (event.eventType === 'PARSED_DUEL_ENDED') {
                            const { winner_username } = event.data;
                            if (winner_username) {
                                const { rows: [winnerUser] } = await client.query('SELECT id FROM users WHERE linked_roblox_username = $1', [winner_username]);
                                if (winnerUser) {
                                    await client.query("UPDATE duels SET status = 'completed_unseen', winner_id = $1 WHERE id = $2", [winnerUser.id, duel.id]);
                                    console.log(`Duel ${duel.id} result recorded. Winner: ${winner_username}. Status set to completed_unseen.`);
                                } else {
                                    console.warn(`Winner username '${winner_username}' not found for duel ${duel.id}. Canceling duel.`);
                                    await client.query("UPDATE duels SET status = 'canceled' WHERE id = $1", [duel.id]);
                                }
                            } else {
                                console.warn(`Could not determine winner for duel ${duel.id}. Canceling duel.`);
                                await client.query("UPDATE duels SET status = 'canceled' WHERE id = $1", [duel.id]);
                            }
                        }
                        
                    } else {
                        console.warn(`Received log for an unknown bot_duel_id: ${event.duelId}.`);
                    }
                    await client.query('COMMIT');
                } catch (innerErr) {
                    await client.query('ROLLBACK');
                    console.error(`Error processing log event for bot_duel_id ${event.duelId}:`, innerErr.message);
                } finally {
                    client.release();
                }
            }
            res.status(200).json({ message: 'Log batch received and processed successfully.' });
        } catch (err) {
            console.error("Log batch processing error:", err.message);
            res.status(500).json({ message: 'Failed to process logs batch.' });
        }
    }
);

module.exports = router;
