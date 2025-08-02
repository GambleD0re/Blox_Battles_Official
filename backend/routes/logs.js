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

                const { rows: [duel] } = await client.query('SELECT id, transcript, status, player_loadouts FROM duels WHERE id = $1 FOR UPDATE', [websiteDuelId]);
                
                if (duel) {
                    let transcript = duel.transcript || [];
                    transcript.push(event);
                    await client.query('UPDATE duels SET transcript = $1 WHERE id = $2', [JSON.stringify(transcript), duel.id]);

                    // [NEW] Handle loadout updates
                    if (event.eventType === 'PARSED_LOADOUT_UPDATE' && event.data.playerName) {
                        const currentLoadouts = duel.player_loadouts || {};
                        currentLoadouts[event.data.playerName] = event.data.loadout;
                        await client.query('UPDATE duels SET player_loadouts = $1 WHERE id = $2', [JSON.stringify(currentLoadouts), duel.id]);
                    }

                    if (event.eventType === 'PARSED_DUEL_ENDED') {
                        if (duel.status === 'in_progress' || duel.status === 'under_review') {
                            const { winner_username } = event.data;
                            if (winner_username) {
                                const { rows: [winnerUser] } = await client.query('SELECT id, linked_roblox_id, avatar_url, linked_roblox_username FROM users WHERE linked_roblox_username = $1', [winner_username]);
                                if (winnerUser) {
                                    await client.query("UPDATE duels SET status = 'completed_unseen', winner_id = $1, result_posted_at = NOW() WHERE id = $2", [winnerUser.id, duel.id]);
                                    
                                    // [NEW] Create task for Discord bot
                                    const { rows: [fullDuelData] } = await client.query('SELECT * FROM duels WHERE id = $1', [duel.id]);
                                    const loserId = winnerUser.id.toString() === fullDuelData.challenger_id.toString() ? fullDuelData.opponent_id : fullDuelData.challenger_id;
                                    const { rows: [loserUser] } = await client.query('SELECT linked_roblox_id, avatar_url, linked_roblox_username FROM users WHERE id = $1', [loserId]);
                                    
                                    const taskPayload = {
                                        duelId: duel.id,
                                        winner: { username: winnerUser.linked_roblox_username, robloxId: winnerUser.linked_roblox_id, avatarUrl: winnerUser.avatar_url },
                                        loser: { username: loserUser.linked_roblox_username, robloxId: loserUser.linked_roblox_id, avatarUrl: loserUser.avatar_url },
                                        wager: fullDuelData.wager,
                                        pot: fullDuelData.pot,
                                        mapName: fullDuelData.map,
                                        finalScores: event.data.finalScores,
                                        playerLoadouts: fullDuelData.player_loadouts,
                                    };
                                    await client.query("INSERT INTO tasks (task_type, payload) VALUES ('POST_DUEL_RESULT_TO_DISCORD', $1)", [JSON.stringify(taskPayload)]);
                                    
                                    console.log(`Duel ${duel.id} result recorded. Winner: ${winner_username}. Discord task created.`);
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

module.exports = router;// backend/routes/logs.js
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

                const { rows: [duel] } = await client.query('SELECT id, transcript, status, player_loadouts FROM duels WHERE id = $1 FOR UPDATE', [websiteDuelId]);
                
                if (duel) {
                    let transcript = duel.transcript || [];
                    transcript.push(event);
                    await client.query('UPDATE duels SET transcript = $1 WHERE id = $2', [JSON.stringify(transcript), duel.id]);

                    // [NEW] Handle loadout updates
                    if (event.eventType === 'PARSED_LOADOUT_UPDATE' && event.data.playerName) {
                        const currentLoadouts = duel.player_loadouts || {};
                        currentLoadouts[event.data.playerName] = event.data.loadout;
                        await client.query('UPDATE duels SET player_loadouts = $1 WHERE id = $2', [JSON.stringify(currentLoadouts), duel.id]);
                    }

                    if (event.eventType === 'PARSED_DUEL_ENDED') {
                        if (duel.status === 'in_progress' || duel.status === 'under_review') {
                            const { winner_username } = event.data;
                            if (winner_username) {
                                const { rows: [winnerUser] } = await client.query('SELECT id, linked_roblox_id, avatar_url, linked_roblox_username FROM users WHERE linked_roblox_username = $1', [winner_username]);
                                if (winnerUser) {
                                    await client.query("UPDATE duels SET status = 'completed_unseen', winner_id = $1, result_posted_at = NOW() WHERE id = $2", [winnerUser.id, duel.id]);
                                    
                                    // [NEW] Create task for Discord bot
                                    const { rows: [fullDuelData] } = await client.query('SELECT * FROM duels WHERE id = $1', [duel.id]);
                                    const loserId = winnerUser.id.toString() === fullDuelData.challenger_id.toString() ? fullDuelData.opponent_id : fullDuelData.challenger_id;
                                    const { rows: [loserUser] } = await client.query('SELECT linked_roblox_id, avatar_url, linked_roblox_username FROM users WHERE id = $1', [loserId]);
                                    
                                    const taskPayload = {
                                        duelId: duel.id,
                                        winner: { username: winnerUser.linked_roblox_username, robloxId: winnerUser.linked_roblox_id, avatarUrl: winnerUser.avatar_url },
                                        loser: { username: loserUser.linked_roblox_username, robloxId: loserUser.linked_roblox_id, avatarUrl: loserUser.avatar_url },
                                        wager: fullDuelData.wager,
                                        pot: fullDuelData.pot,
                                        mapName: fullDuelData.map,
                                        finalScores: event.data.finalScores,
                                        playerLoadouts: fullDuelData.player_loadouts,
                                    };
                                    await client.query("INSERT INTO tasks (task_type, payload) VALUES ('POST_DUEL_RESULT_TO_DISCORD', $1)", [JSON.stringify(taskPayload)]);
                                    
                                    console.log(`Duel ${duel.id} result recorded. Winner: ${winner_username}. Discord task created.`);
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

module.exports = router;// backend/routes/logs.js
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

                const { rows: [duel] } = await client.query('SELECT id, transcript, status, player_loadouts FROM duels WHERE id = $1 FOR UPDATE', [websiteDuelId]);
                
                if (duel) {
                    let transcript = duel.transcript || [];
                    transcript.push(event);
                    await client.query('UPDATE duels SET transcript = $1 WHERE id = $2', [JSON.stringify(transcript), duel.id]);

                    // [NEW] Handle loadout updates
                    if (event.eventType === 'PARSED_LOADOUT_UPDATE' && event.data.playerName) {
                        const currentLoadouts = duel.player_loadouts || {};
                        currentLoadouts[event.data.playerName] = event.data.loadout;
                        await client.query('UPDATE duels SET player_loadouts = $1 WHERE id = $2', [JSON.stringify(currentLoadouts), duel.id]);
                    }

                    if (event.eventType === 'PARSED_DUEL_ENDED') {
                        if (duel.status === 'in_progress' || duel.status === 'under_review') {
                            const { winner_username } = event.data;
                            if (winner_username) {
                                const { rows: [winnerUser] } = await client.query('SELECT id, linked_roblox_id, avatar_url, linked_roblox_username FROM users WHERE linked_roblox_username = $1', [winner_username]);
                                if (winnerUser) {
                                    await client.query("UPDATE duels SET status = 'completed_unseen', winner_id = $1, result_posted_at = NOW() WHERE id = $2", [winnerUser.id, duel.id]);
                                    
                                    // [NEW] Create task for Discord bot
                                    const { rows: [fullDuelData] } = await client.query('SELECT * FROM duels WHERE id = $1', [duel.id]);
                                    const loserId = winnerUser.id.toString() === fullDuelData.challenger_id.toString() ? fullDuelData.opponent_id : fullDuelData.challenger_id;
                                    const { rows: [loserUser] } = await client.query('SELECT linked_roblox_id, avatar_url, linked_roblox_username FROM users WHERE id = $1', [loserId]);
                                    
                                    const taskPayload = {
                                        duelId: duel.id,
                                        winner: { username: winnerUser.linked_roblox_username, robloxId: winnerUser.linked_roblox_id, avatarUrl: winnerUser.avatar_url },
                                        loser: { username: loserUser.linked_roblox_username, robloxId: loserUser.linked_roblox_id, avatarUrl: loserUser.avatar_url },
                                        wager: fullDuelData.wager,
                                        pot: fullDuelData.pot,
                                        mapName: fullDuelData.map,
                                        finalScores: event.data.finalScores,
                                        playerLoadouts: fullDuelData.player_loadouts,
                                    };
                                    await client.query("INSERT INTO tasks (task_type, payload) VALUES ('POST_DUEL_RESULT_TO_DISCORD', $1)", [JSON.stringify(taskPayload)]);
                                    
                                    console.log(`Duel ${duel.id} result recorded. Winner: ${winner_username}. Discord task created.`);
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

module.exports = router;// backend/routes/logs.js
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

                const { rows: [duel] } = await client.query('SELECT id, transcript, status, player_loadouts FROM duels WHERE id = $1 FOR UPDATE', [websiteDuelId]);
                
                if (duel) {
                    let transcript = duel.transcript || [];
                    transcript.push(event);
                    await client.query('UPDATE duels SET transcript = $1 WHERE id = $2', [JSON.stringify(transcript), duel.id]);

                    // [NEW] Handle loadout updates
                    if (event.eventType === 'PARSED_LOADOUT_UPDATE' && event.data.playerName) {
                        const currentLoadouts = duel.player_loadouts || {};
                        currentLoadouts[event.data.playerName] = event.data.loadout;
                        await client.query('UPDATE duels SET player_loadouts = $1 WHERE id = $2', [JSON.stringify(currentLoadouts), duel.id]);
                    }

                    if (event.eventType === 'PARSED_DUEL_ENDED') {
                        if (duel.status === 'in_progress' || duel.status === 'under_review') {
                            const { winner_username } = event.data;
                            if (winner_username) {
                                const { rows: [winnerUser] } = await client.query('SELECT id, linked_roblox_id, avatar_url, linked_roblox_username FROM users WHERE linked_roblox_username = $1', [winner_username]);
                                if (winnerUser) {
                                    await client.query("UPDATE duels SET status = 'completed_unseen', winner_id = $1, result_posted_at = NOW() WHERE id = $2", [winnerUser.id, duel.id]);
                                    
                                    // [NEW] Create task for Discord bot
                                    const { rows: [fullDuelData] } = await client.query('SELECT * FROM duels WHERE id = $1', [duel.id]);
                                    const loserId = winnerUser.id.toString() === fullDuelData.challenger_id.toString() ? fullDuelData.opponent_id : fullDuelData.challenger_id;
                                    const { rows: [loserUser] } = await client.query('SELECT linked_roblox_id, avatar_url, linked_roblox_username FROM users WHERE id = $1', [loserId]);
                                    
                                    const taskPayload = {
                                        duelId: duel.id,
                                        winner: { username: winnerUser.linked_roblox_username, robloxId: winnerUser.linked_roblox_id, avatarUrl: winnerUser.avatar_url },
                                        loser: { username: loserUser.linked_roblox_username, robloxId: loserUser.linked_roblox_id, avatarUrl: loserUser.avatar_url },
                                        wager: fullDuelData.wager,
                                        pot: fullDuelData.pot,
                                        mapName: fullDuelData.map,
                                        finalScores: event.data.finalScores,
                                        playerLoadouts: fullDuelData.player_loadouts,
                                    };
                                    await client.query("INSERT INTO tasks (task_type, payload) VALUES ('POST_DUEL_RESULT_TO_DISCORD', $1)", [JSON.stringify(taskPayload)]);
                                    
                                    console.log(`Duel ${duel.id} result recorded. Winner: ${winner_username}. Discord task created.`);
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
