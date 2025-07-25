// backend/routes/logs.js
// This file handles receiving and storing duel event logs from the Roblox bot.

const express = require('express');
const db = require('../database/database');
const { body, validationResult } = require('express-validator');
const util = require('util'); // Import util for promisify

// Promisify db methods for async/await usage
db.get = util.promisify(db.get);
db.run = util.promisify(db.run);
db.all = util.promisify(db.all);

const router = express.Router();

// Middleware to protect the logging endpoint with the bot's API key
const authenticateBot = (req, res, next) => {
    const apiKey = req.headers['x-api-key'];
    if (!process.env.BOT_API_KEY) {
        console.error("FATAL ERROR: BOT_API_KEY is not defined in .env file.");
        return res.status(500).json({ message: 'Server configuration error: BOT_API_KEY missing.' });
    }
    if (!apiKey || apiKey !== process.env.BOT_API_KEY) {
        console.warn(`Unauthorized log access attempt from IP: ${req.ip} with API Key: ${apiKey}`);
        return res.status(401).json({ message: 'Unauthorized: Invalid or missing API key.' });
    }
    next();
};

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

                await db.run('BEGIN TRANSACTION');

                try {
                    let duel = null;
                    let websiteDuelIdFromEvent = event.data ? event.data.websiteDuelId : null;

                    if (event.eventType === 'DUEL_STARTED' && websiteDuelIdFromEvent) {
                        duel = await db.get('SELECT * FROM duels WHERE id = ?', [websiteDuelIdFromEvent]);
                        if (duel) {
                            await db.run('UPDATE duels SET bot_duel_id = ? WHERE id = ?', [event.duelId, duel.id]);
                            console.log(`Duel ${duel.id} linked to bot_duel_id: ${event.duelId}`);
                        }
                    } else {
                        duel = await db.get('SELECT * FROM duels WHERE bot_duel_id = ?', [event.duelId]);
                    }
                    
                    if (duel) {
                        let transcript = duel.transcript ? JSON.parse(duel.transcript) : [];
                        transcript.push(event);
                        await db.run('UPDATE duels SET transcript = ? WHERE id = ?', [JSON.stringify(transcript), duel.id]);

                        // --- [REWORKED] Duel Conclusion Logic ---
                        if (event.eventType === 'PARSED_DUEL_ENDED') {
                            const { winner_username } = event.data;
                            if (winner_username) {
                                const winnerUser = await db.get('SELECT id FROM users WHERE linked_roblox_username = ?', [winner_username]);
                                if (winnerUser) {
                                    // [FIX] Instead of paying out, set status to 'completed_unseen'
                                    // This triggers the frontend modal. Gems remain in the pot.
                                    await db.run("UPDATE duels SET status = 'completed_unseen', winner_id = ? WHERE id = ?", [winnerUser.id, duel.id]);
                                    console.log(`Duel ${duel.id} result recorded. Winner: ${winner_username}. Status set to completed_unseen.`);
                                } else {
                                    console.warn(`Winner username '${winner_username}' not found for duel ${duel.id}. Canceling duel.`);
                                    await db.run("UPDATE duels SET status = 'canceled' WHERE id = ?", [duel.id]);
                                }
                            } else {
                                console.warn(`Could not determine winner for duel ${duel.id}. Canceling duel.`);
                                await db.run("UPDATE duels SET status = 'canceled' WHERE id = ?", [duel.id]);
                            }
                        }
                        
                    } else {
                        console.warn(`Received log for an unknown bot_duel_id: ${event.duelId}.`);
                    }
                    await db.run('COMMIT');
                } catch (innerErr) {
                    await db.run('ROLLBACK');
                    console.error(`Error processing log event for bot_duel_id ${event.duelId}:`, innerErr.message);
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
