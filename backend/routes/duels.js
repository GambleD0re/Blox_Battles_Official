// backend/routes/duels.js
const express = require('express');
const { body, query, param } = require('express-validator');
const db = require('../database/database');
const { authenticateToken, handleValidationErrors, authenticateBot } = require('../middleware/auth');
const GAME_DATA = require('../game-data-store');

const router = express.Router();

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

// --- Dispute System Endpoints ---
router.get('/unseen-results', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.userId;
        const sql = `
            SELECT 
                d.id, d.wager, d.winner_id, d.challenger_id, d.opponent_id, d.result_posted_at,
                w.linked_roblox_username as winner_username,
                l.linked_roblox_username as loser_username
            FROM duels d
            JOIN users w ON d.winner_id = w.id
            JOIN users l ON (CASE WHEN d.winner_id = d.challenger_id THEN d.opponent_id ELSE d.challenger_id END) = l.id
            WHERE 
                d.status = 'completed_unseen' AND
                ((d.challenger_id = $1 AND d.challenger_seen_result = FALSE) OR 
                 (d.opponent_id = $1 AND d.opponent_seen_result = FALSE))
        `;
        const { rows: results } = await db.query(sql, [userId]);
        res.status(200).json(results);
    } catch (err) {
        console.error("Get Unseen Results Error:", err.message);
        res.status(500).json({ message: 'An internal server error occurred.' });
    }
});

router.post('/:id/confirm-result', authenticateToken, param('id').isInt(), handleValidationErrors, async (req, res) => {
    const duelId = req.params.id;
    const userId = req.user.userId;
    const client = await db.getPool().connect();
    try {
        await client.query('BEGIN');
        
        const { rows: [duel] } = await client.query("SELECT * FROM duels WHERE id = $1 FOR UPDATE", [duelId]);
        
        if (!duel) { await client.query('ROLLBACK'); return res.status(404).json({ message: 'Duel not found.' }); }
        if (duel.status === 'under_review') { await client.query('ROLLBACK'); return res.status(200).json({ message: 'This duel is now under review by an admin.' }); }
        if (duel.status !== 'completed_unseen') { await client.query('ROLLBACK'); return res.status(400).json({ message: 'Duel result has already been processed.' }); }

        let columnToUpdate;
        if (duel.challenger_id.toString() === userId) {
            columnToUpdate = 'challenger_seen_result';
        } else if (duel.opponent_id.toString() === userId) {
            columnToUpdate = 'opponent_seen_result';
        } else {
            await client.query('ROLLBACK');
            return res.status(403).json({ message: 'You are not a participant in this duel.' });
        }

        const updateSql = `UPDATE duels SET ${columnToUpdate} = TRUE WHERE id = $1 RETURNING *`;
        const { rows: [updatedDuel] } = await client.query(updateSql, [duelId]);

        if (updatedDuel.challenger_seen_result && updatedDuel.opponent_seen_result) {
            const loserId = (updatedDuel.winner_id.toString() === updatedDuel.challenger_id.toString()) ? updatedDuel.opponent_id : updatedDuel.challenger_id;
            
            await client.query('UPDATE users SET gems = gems + $1, wins = wins + 1 WHERE id = $2', [updatedDuel.pot, updatedDuel.winner_id]);
            await client.query('UPDATE users SET losses = losses + 1 WHERE id = $1', [loserId]);
            await client.query("UPDATE duels SET status = 'completed' WHERE id = $1", [duelId]);
            
            console.log(`Duel ${duelId} finalized and pot of ${updatedDuel.pot} paid out to winner ${updatedDuel.winner_id}.`);
        }
        
        await client.query('COMMIT');
        res.status(200).json({ message: 'Result confirmed.' });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error("Confirm Result Error:", err.message);
        res.status(500).json({ message: 'An internal server error occurred.' });
    } finally {
        client.release();
    }
});


router.post('/:id/dispute', authenticateToken, param('id').isInt(), body('reason').trim().notEmpty(), body('has_video_evidence').isBoolean(), handleValidationErrors, async (req, res) => {
    const duelId = req.params.id;
    const reporterId = req.user.userId;
    const { reason, has_video_evidence } = req.body;
    const client = await db.getPool().connect();
    try {
        await client.query('BEGIN');
        const { rows: [duel] } = await client.query("SELECT * FROM duels WHERE id = $1 AND (status = 'completed_unseen' OR status = 'completed') FOR UPDATE", [duelId]);
        if (!duel) { await client.query('ROLLBACK'); return res.status(404).json({ message: 'Duel not found or cannot be disputed.' }); }
        
        const reportedId = (duel.challenger_id.toString() === reporterId) ? duel.opponent_id : duel.challenger_id;
        await client.query('INSERT INTO disputes (duel_id, reporter_id, reported_id, reason, has_video_evidence) VALUES ($1, $2, $3, $4, $5)', [duelId, reporterId, reportedId, reason, has_video_evidence]);
        
        if (duel.winner_id.toString() === reportedId.toString()) {
            await client.query("UPDATE duels SET status = 'under_review' WHERE id = $1", [duelId]);
            console.log(`Dispute filed for duel ${duelId}. Winner was reported, pot held.`);
        } else {
            let columnToUpdate = (duel.challenger_id.toString() === reporterId) ? 'challenger_seen_result' : 'opponent_seen_result';
            await client.query(`UPDATE duels SET ${columnToUpdate} = TRUE WHERE id = $1`, [duelId]);
            console.log(`Dispute filed for duel ${duelId}. Loser was reported, pot will be paid out normally if other player confirms.`);
        }
        await client.query('COMMIT');
        res.status(201).json({ message: 'Dispute filed successfully. An admin will review it shortly.' });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error("Dispute Filing Error:", err.message);
        res.status(500).json({ message: 'An internal server error occurred.' });
    } finally {
        client.release();
    }
});


// --- Existing Duel Routes ---

router.get('/find-player', authenticateToken, query('roblox_username').trim().escape().notEmpty(), handleValidationErrors, async (req, res) => {
    try {
        const { roblox_username } = req.query;
        const { rows: [player] } = await db.query('SELECT id, linked_roblox_username, avatar_url FROM users WHERE linked_roblox_username ILIKE $1 AND id != $2', [roblox_username, req.user.userId]);
        if (!player) { return res.status(404).json({ message: 'Player not found or you searched for yourself.' }); }
        res.status(200).json(player);
    } catch(err) {
        console.error("Find Player Error:", err.message);
        res.status(500).json({ message: 'An internal server error occurred.' });
    }
});

const validRegions = GAME_DATA.regions.map(r => r.id);
router.post('/challenge', authenticateToken,
    body('opponent_id').isUUID(), body('wager').isInt({ gt: 0 }), body('map').trim().escape().notEmpty(),
    body('banned_weapons').isArray(), body('region').isIn(validRegions),
    handleValidationErrors,
    async (req, res) => {
        const challenger_id = req.user.userId;
        const { opponent_id, wager, banned_weapons, map, region } = req.body;
        const client = await db.getPool().connect();
        try {
            await client.query('BEGIN');
            const { rows: [challenger] } = await client.query("SELECT status, ban_expires_at, ban_reason, gems, linked_roblox_username FROM users WHERE id = $1 FOR UPDATE", [challenger_id]);

            if (challenger?.status === 'banned') {
                const now = new Date();
                const expires = challenger.ban_expires_at ? new Date(challenger.ban_expires_at) : null;
                if (expires && now > expires) {
                    await client.query("UPDATE users SET status = 'active', ban_reason = NULL, ban_expires_at = NULL, ban_applied_at = NULL WHERE id = $1", [challenger_id]);
                } else {
                    await client.query('ROLLBACK');
                    return res.status(403).json({ message: `You are currently banned for: ${challenger.ban_reason}` });
                }
            }
            
            if (parseInt(challenger.gems) < wager) {
                await client.query('ROLLBACK');
                return res.status(400).json({ message: 'You do not have enough gems for this wager.' });
            }

            const { rows: [opponent] } = await client.query('SELECT discord_id, discord_notifications_enabled, accepting_challenges FROM users WHERE id = $1', [opponent_id]);
            if (!opponent.accepting_challenges) {
                await client.query('ROLLBACK');
                return res.status(403).json({ message: 'This player is not currently accepting challenges.' });
            }

            const bannedWeaponsStr = JSON.stringify(banned_weapons || []);
            await client.query('INSERT INTO duels (challenger_id, opponent_id, wager, banned_weapons, map, region) VALUES ($1, $2, $3, $4, $5, $6)', [challenger_id, opponent_id, wager, bannedWeaponsStr, map, region]);
            
            if (opponent && opponent.discord_id && opponent.discord_notifications_enabled) {
                const mapInfo = GAME_DATA.maps.find(m => m.id === map);
                const taskPayload = {
                    recipientDiscordId: opponent.discord_id,
                    challengerUsername: challenger.linked_roblox_username,
                    wager: wager,
                    mapName: mapInfo ? mapInfo.name : map
                };
                await client.query("INSERT INTO tasks (task_type, payload) VALUES ('SEND_DUEL_CHALLENGE_DM', $1)", [JSON.stringify(taskPayload)]);
            }

            await client.query('COMMIT');
            res.status(201).json({ message: 'Challenge sent!' });
        } catch(err) {
            await client.query('ROLLBACK');
            console.error("Challenge Error:", err.message);
            res.status(500).json({ message: 'An internal server error occurred.' });
        } finally {
            client.release();
        }
    }
);

router.post('/:id/start', authenticateToken, param('id').isInt(), handleValidationErrors, async (req, res) => {
    const duelId = req.params.id;
    const userId = req.user.userId;
    const client = await db.getPool().connect();
    
    try {
        await client.query('BEGIN');

        const { rows: [duel] } = await client.query(
            'SELECT * FROM duels WHERE id = $1 AND (challenger_id = $2 OR opponent_id = $2) FOR UPDATE',
            [duelId, userId]
        );

        if (!duel) {
            await client.query('ROLLBACK');
            return res.status(404).json({ message: 'Duel not found or you are not a participant.' });
        }
        if (duel.status !== 'accepted') {
            await client.query('ROLLBACK');
            return res.status(400).json({ message: 'This duel cannot be started because it is not in the "accepted" state.' });
        }

        const BOT_OFFLINE_THRESHOLD_SECONDS = 60;
        
        // [MODIFIED] Logic to find an available server from either official or co-host pools.
        let availableServer = null;

        // 1. Prioritize official servers
        const officialServerSql = `
            SELECT server_id, join_link
            FROM game_servers
            WHERE region = $1
              AND player_count < 40
              AND last_heartbeat >= NOW() - INTERVAL '${BOT_OFFLINE_THRESHOLD_SECONDS} seconds'
            ORDER BY player_count ASC
            LIMIT 1
            FOR UPDATE SKIP LOCKED
        `;
        const { rows: [officialServer] } = await client.query(officialServerSql, [duel.region]);

        if (officialServer) {
            availableServer = { serverId: officialServer.server_id, joinLink: officialServer.join_link, type: 'official' };
        } else {
            // 2. If no official server, look for a co-host contract
            const cohostContractSql = `
                SELECT id, private_server_link
                FROM host_contracts
                WHERE region = $1 AND status = 'active'
                AND last_heartbeat >= NOW() - INTERVAL '${BOT_OFFLINE_THRESHOLD_SECONDS} seconds'
                -- Add ordering logic if needed, e.g., by oldest heartbeat to distribute load
                LIMIT 1
                FOR UPDATE SKIP LOCKED
            `;
            const { rows: [cohostContract] } = await client.query(cohostContractSql, [duel.region]);
            if(cohostContract) {
                availableServer = { serverId: cohostContract.id, joinLink: cohostContract.private_server_link, type: 'cohost' };
            }
        }

        if (!availableServer) {
            await client.query('ROLLBACK');
            return res.status(400).json({ message: `All servers for the ${duel.region} region are currently full. Please try again shortly.` });
        }
        
        // Note: For co-host bots, we don't manage player count in a central table. This is a simplification.
        if (availableServer.type === 'official') {
             await client.query('UPDATE game_servers SET player_count = player_count + 2 WHERE server_id = $1', [availableServer.serverId]);
        }
        
        const updateSql = `
            UPDATE duels 
            SET status = 'started', 
                started_at = NOW(), 
                server_invite_link = $1, 
                assigned_server_id = $2 
            WHERE id = $3
        `;
        await client.query(updateSql, [availableServer.joinLink, availableServer.serverId, duelId]);

        const { rows: [challengerInfo] } = await client.query('SELECT linked_roblox_username FROM users WHERE id = $1', [duel.challenger_id]);
        const { rows: [opponentInfo] } = await client.query('SELECT linked_roblox_username FROM users WHERE id = $1', [duel.opponent_id]);
        const mapInfo = GAME_DATA.maps.find(m => m.id === duel.map);
        
        const taskPayload = {
            websiteDuelId: duel.id,
            serverId: availableServer.serverId, // This will be the contractId for co-hosts
            serverLink: availableServer.joinLink,
            challenger: challengerInfo.linked_roblox_username,
            opponent: opponentInfo.linked_roblox_username,
            map: mapInfo ? mapInfo.name : duel.map,
            bannedWeapons: (duel.banned_weapons || []).map(id => GAME_DATA.weapons.find(w => w.id === id)?.name || id),
            wager: duel.wager,
        };
        await client.query("INSERT INTO tasks (task_type, payload) VALUES ($1, $2)", ['REFEREE_DUEL', JSON.stringify(taskPayload)]);
        
        const starterId = userId;
        const otherPlayerId = duel.challenger_id.toString() === starterId ? duel.opponent_id : duel.challenger_id;
        const { rows: [otherPlayer] } = await client.query('SELECT discord_id, discord_notifications_enabled FROM users WHERE id = $1', [otherPlayerId]);
        if (otherPlayer && otherPlayer.discord_id && otherPlayer.discord_notifications_enabled) {
            const { rows: [starter] } = await client.query('SELECT linked_roblox_username FROM users WHERE id = $1', [starterId]);
            const notificationPayload = {
                recipientDiscordId: otherPlayer.discord_id,
                starterUsername: starter.linked_roblox_username,
                serverLink: availableServer.joinLink,
                duelId: duelId
            };
            await client.query("INSERT INTO tasks (task_type, payload) VALUES ('SEND_DUEL_STARTED_DM', $1)", [JSON.stringify(notificationPayload)]);
        }

        await client.query('COMMIT');
        res.status(200).json({ message: 'Duel started! Server assigned.', serverLink: availableServer.joinLink });

    } catch (err) {
        await client.query('ROLLBACK');
        console.error(`[DUEL START] Error starting duel ${duelId}:`, err);
        res.status(500).json({ message: 'An internal server error occurred while starting the duel.' });
    } finally {
        client.release();
    }
});


router.post('/:id/bot-confirm', authenticateBot, param('id').isInt(), handleValidationErrors, async (req, res) => {
    const duelId = req.params.id;
    try {
        const { rowCount } = await db.query(
            "UPDATE duels SET status = 'in_progress' WHERE id = $1 AND status = 'started'",
            [duelId]
        );

        if (rowCount === 0) {
            return res.status(404).json({ message: 'Duel not found or was not in "started" state.' });
        }
        
        console.log(`[BOT-CONFIRM] Duel ${duelId} has been matched in-game and is now in progress.`);
        res.status(200).json({ message: `Duel ${duelId} confirmed as in-progress.` });

    } catch (err) {
        console.error(`[BOT-CONFIRM] Error confirming duel ${duelId}:`, err);
        res.status(500).json({ message: 'An internal server error occurred.' });
    }
});


router.post('/:id/forfeit', authenticateToken, param('id').isInt(), handleValidationErrors, async (req, res) => {
    const duelId = req.params.id;
    const forfeitingUserId = req.user.userId;
    const client = await db.getPool().connect();
    try {
        await client.query('BEGIN');
        const { rows: [duel] } = await client.query('SELECT * FROM duels WHERE id = $1 FOR UPDATE', [duelId]);
        if (!duel) { await client.query('ROLLBACK'); return res.status(404).json({ message: 'Duel not found.' }); }
        if (duel.status !== 'started' && duel.status !== 'in_progress') { await client.query('ROLLBACK'); return res.status(400).json({ message: 'You can only forfeit a duel that has started.' }); }
        if (duel.challenger_id.toString() !== forfeitingUserId && duel.opponent_id.toString() !== forfeitingUserId) { await client.query('ROLLBACK'); return res.status(403).json({ message: 'You are not a participant in this duel.' }); }
        
        const winnerId = (duel.challenger_id.toString() === forfeitingUserId) ? duel.opponent_id : duel.challenger_id;
        await client.query('UPDATE users SET gems = gems + $1, wins = wins + 1 WHERE id = $2', [duel.pot, winnerId]);
        await client.query('UPDATE users SET losses = losses + 1 WHERE id = $1', [forfeitingUserId]);
        await client.query("UPDATE duels SET status = 'completed', winner_id = $1 WHERE id = $2", [winnerId, duel.id]);
        
        await decrementPlayerCount(client, duel.id);

        await client.query('COMMIT');
        res.status(200).json({ message: 'You have forfeited the duel.' });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error(`[DUEL FORFEIT] Error forfeiting duel ${duelId}:`, err);
        res.status(500).json({ message: 'An internal server error occurred while forfeiting the duel.' });
    } finally {
        client.release();
    }
});

router.get('/history', authenticateToken, async(req, res) => {
    try {
        const sql = `
            SELECT d.id, d.wager, d.status, d.winner_id, d.challenger_id, c.linked_roblox_username as challenger_name, o.linked_roblox_username as opponent_name
            FROM duels d 
            LEFT JOIN users c ON d.challenger_id = c.id 
            LEFT JOIN users o ON d.opponent_id = o.id
            WHERE (d.challenger_id = $1 OR d.opponent_id = $1) AND d.status IN ('completed', 'under_review', 'declined', 'canceled', 'cheater_forfeit')
            ORDER BY d.created_at DESC LIMIT 25
        `;
        const userId = req.user.userId;
        const { rows: duels } = await db.query(sql, [userId]);
        const history = duels.map(duel => ({
            id: duel.id, wager: duel.wager,
            opponent_name: duel.challenger_id.toString() === userId ? duel.opponent_name : duel.challenger_name || 'Unknown',
            outcome: duel.winner_id && duel.winner_id.toString() === userId ? 'win' : (duel.status === 'declined' || duel.status === 'canceled' ? 'declined' : 'loss'),
            status: duel.status
        }));
        res.status(200).json(history);
    } catch(err) {
        console.error("Get Duel History Error:", err.message);
        res.status(500).json({ message: 'An internal server error occurred.' });
    }
});

router.post('/respond', authenticateToken, body('duel_id').isInt(), body('response').isIn(['accept', 'decline']), handleValidationErrors, async (req, res) => {
    const { duel_id, response } = req.body;
    const opponentId = req.user.userId;
    const client = await db.getPool().connect();
    try {
        await client.query('BEGIN');
        const { rows: [duel] } = await client.query("SELECT * FROM duels WHERE id = $1 AND opponent_id = $2 AND status = 'pending' FOR UPDATE", [duel_id, opponentId]);
        if (!duel) { await client.query('ROLLBACK'); return res.status(404).json({ message: 'Duel not found, is not pending, or you are not the opponent.' }); }

        if (response === 'decline') {
            await client.query('UPDATE duels SET status = $1 WHERE id = $2', ['declined', duel_id]);
            await client.query('COMMIT');
            return res.status(200).json({ message: 'Duel declined.' });
        } 
        
        const { rows: [opponent] } = await client.query('SELECT gems, status, linked_roblox_username FROM users WHERE id = $1 FOR UPDATE', [opponentId]);
        if (opponent.status === 'banned') {
            await client.query('ROLLBACK');
            return res.status(403).json({ message: 'You cannot accept duels while your account is banned.' });
        }

        const { rows: [challenger] } = await client.query('SELECT discord_id, discord_notifications_enabled, gems FROM users WHERE id = $1 FOR UPDATE', [duel.challenger_id]);
        if (!opponent || parseInt(opponent.gems) < parseInt(duel.wager)) { await client.query('ROLLBACK'); return res.status(400).json({ message: 'You do not have enough gems.' }); }
        if (!challenger || parseInt(challenger.gems) < parseInt(duel.wager)) { await client.query('ROLLBACK'); return res.status(400).json({ message: 'The challenger no longer has enough gems.' }); }

        await client.query('UPDATE users SET gems = gems - $1 WHERE id = $2', [duel.wager, opponentId]);
        await client.query('UPDATE users SET gems = gems - $1 WHERE id = $2', [duel.wager, duel.challenger_id]);
        
        const totalPot = parseInt(duel.wager) * 2;
        let taxCollected = 0;
        if (totalPot > 100) {
            taxCollected = Math.ceil(totalPot * 0.01);
        }
        const finalPot = totalPot - taxCollected;
        
        await client.query('UPDATE duels SET status = $1, accepted_at = NOW(), pot = $2, tax_collected = $3 WHERE id = $4', ['accepted', finalPot, taxCollected, duel_id]);
        
        if (challenger.discord_id && challenger.discord_notifications_enabled) {
            const taskPayload = {
                recipientDiscordId: challenger.discord_id,
                opponentUsername: opponent.linked_roblox_username,
                duelId: duel_id
            };
            await client.query("INSERT INTO tasks (task_type, payload) VALUES ('SEND_DUEL_ACCEPTED_DM', $1)", [JSON.stringify(taskPayload)]);
        }

        await client.query('COMMIT');
        res.status(200).json({ message: 'Duel accepted! You can now start the match from your inbox.' });
    } catch(err) {
        await client.query('ROLLBACK');
        console.error("Respond to Duel Error:", err.message);
        res.status(500).json({ message: 'An internal server error occurred.' });
    } finally {
        client.release();
    }
});

router.delete('/cancel/:id', authenticateToken, param('id').isInt(), handleValidationErrors, async (req, res) => {
    try {
        const duelId = req.params.id;
        const challengerId = req.user.userId;
        const { rows: [duel] } = await db.query('SELECT status FROM duels WHERE id = $1 AND challenger_id = $2', [duelId, challengerId]);
        if (!duel) { return res.status(404).json({ message: 'Duel not found or you are not the challenger.' }); }
        if (duel.status !== 'pending') { return res.status(403).json({ message: 'Cannot cancel a duel that has been accepted.' }); }
        
        await db.query('DELETE FROM duels WHERE id = $1', [duelId]);
        res.status(200).json({ message: 'Duel canceled successfully.' });
    } catch (err) {
        console.error("Cancel Duel Error:", err.message);
        res.status(500).json({ message: 'An internal server error occurred.' });
    }
});

router.get('/transcript/:id', authenticateToken, param('id').isInt(), handleValidationErrors, async (req, res) => {
    try {
        const duelId = req.params.id;
        const userId = req.user.userId;
        const { rows: [duel] } = await db.query('SELECT transcript, challenger_id, opponent_id FROM duels WHERE id = $1 AND (challenger_id = $2 OR opponent_id = $2)', [duelId, userId, userId]);
        if (!duel) { return res.status(404).json({ message: 'Duel not found or you were not a participant.' }); }
        res.status(200).json(duel.transcript || []);
    } catch (err) {
        console.error("Get Transcript Error:", err.message);
        res.status(500).json({ message: 'An internal server error occurred.' });
    }
});

module.exports = router;
