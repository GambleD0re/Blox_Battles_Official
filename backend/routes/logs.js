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
                
                // [FIX] The duelId from the bot IS the websiteDuelId.
                const websiteDuelId = event.duelId;

                // This event is now purely informational and for appending to the transcript.
                if (event.eventType === 'DUEL_STARTED') {
                    console.log(`Received DUEL_STARTED event for duel ${websiteDuelId}. Appending to transcript.`);
                }
                
                const { rows: [duel] } = await client.query('SELECT id, transcript FROM duels WHERE id = $1 FOR UPDATE', [websiteDuelId]);
                
                if (duel) {
                    let transcript = duel.transcript || [];
                    transcript.push(event);
                    await client.query('UPDATE duels SET transcript = $1 WHERE id = $2', [JSON.stringify(transcript), duel.id]);

                    if (event.eventType === 'PARSED_DUEL_ENDED') {
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
                    }
                } else {
                    // This is the log message you are seeing. It now correctly reports the website ID.
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
