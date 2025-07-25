// backend/routes/duels.js
const express = require('express');
const { body, query, param } = require('express-validator');
const db = require('../database/database');
const { authenticateToken, handleValidationErrors } = require('../middleware/auth');
const GAME_DATA = require('../game-data-store');

const router = express.Router();

// --- NEW: Dispute System Endpoints ---

router.get('/unseen-results', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.userId;
        const sql = `
            SELECT 
                d.id, d.wager, d.winner_id, d.challenger_id, d.opponent_id,
                w.linked_roblox_username as winner_username,
                l.linked_roblox_username as loser_username
            FROM duels d
            JOIN users w ON d.winner_id = w.id
            JOIN users l ON (CASE WHEN d.winner_id = d.challenger_id THEN d.opponent_id ELSE d.challenger_id END) = l.id
            WHERE 
                d.status = 'completed_unseen' AND
                ((d.challenger_id = ? AND d.challenger_seen_result = FALSE) OR 
                 (d.opponent_id = ? AND d.opponent_seen_result = FALSE))
        `;
        const results = await db.all(sql, [userId, userId]);
        res.status(200).json(results);
    } catch (err) {
        console.error("Get Unseen Results Error:", err.message);
        res.status(500).json({ message: 'An internal server error occurred.' });
    }
});

router.post('/:id/confirm-result', authenticateToken, param('id').isInt(), handleValidationErrors, async (req, res) => {
    const duelId = req.params.id;
    const userId = req.user.userId;
    try {
        await db.run('BEGIN TRANSACTION');
        const duel = await db.get("SELECT * FROM duels WHERE id = ?", [duelId]);
        if (!duel) { await db.run('ROLLBACK'); return res.status(404).json({ message: 'Duel not found.' }); }
        if (duel.status === 'under_review') { await db.run('ROLLBACK'); return res.status(200).json({ message: 'This duel is now under review by an admin.' }); }
        if (duel.status !== 'completed_unseen') { await db.run('ROLLBACK'); return res.status(404).json({ message: 'Duel result has already been processed.' }); }

        if (duel.challenger_id === userId) {
            await db.run('UPDATE duels SET challenger_seen_result = TRUE WHERE id = ?', [duelId]);
        } else if (duel.opponent_id === userId) {
            await db.run('UPDATE duels SET opponent_seen_result = TRUE WHERE id = ?', [duelId]);
        } else {
            await db.run('ROLLBACK');
            return res.status(403).json({ message: 'You are not a participant in this duel.' });
        }

        const updatedDuel = await db.get('SELECT * FROM duels WHERE id = ?', [duelId]);
        if (updatedDuel.challenger_seen_result && updatedDuel.opponent_seen_result) {
            const loserId = (updatedDuel.winner_id === updatedDuel.challenger_id) ? updatedDuel.opponent_id : updatedDuel.challenger_id;
            await db.run('UPDATE users SET gems = gems + ?, wins = wins + 1 WHERE id = ?', [updatedDuel.pot, updatedDuel.winner_id]);
            await db.run('UPDATE users SET losses = losses + 1 WHERE id = ?', [loserId]);
            await db.run("UPDATE duels SET status = 'completed' WHERE id = ?", [duelId]);
            console.log(`Duel ${duelId} finalized and pot of ${updatedDuel.pot} paid out to winner ${updatedDuel.winner_id}.`);
        }
        await db.run('COMMIT');
        res.status(200).json({ message: 'Result confirmed.' });
    } catch (err) {
        await db.run('ROLLBACK').catch(console.error);
        console.error("Confirm Result Error:", err.message);
        res.status(500).json({ message: 'An internal server error occurred.' });
    }
});

router.post('/:id/dispute', authenticateToken, param('id').isInt(), body('reason').trim().notEmpty(), body('has_video_evidence').isBoolean(), handleValidationErrors, async (req, res) => {
    const duelId = req.params.id;
    const reporterId = req.user.userId;
    const { reason, has_video_evidence } = req.body;
    try {
        await db.run('BEGIN TRANSACTION');
        const duel = await db.get("SELECT * FROM duels WHERE id = ? AND (status = 'completed_unseen' OR status = 'completed')", [duelId]);
        if (!duel) { await db.run('ROLLBACK'); return res.status(404).json({ message: 'Duel not found or cannot be disputed.' }); }
        const reportedId = (duel.challenger_id === reporterId) ? duel.opponent_id : duel.challenger_id;
        await db.run('INSERT INTO disputes (duel_id, reporter_id, reported_id, reason, has_video_evidence) VALUES (?, ?, ?, ?, ?)', [duelId, reporterId, reportedId, reason, has_video_evidence]);
        if (duel.winner_id === reportedId) {
            await db.run("UPDATE duels SET status = 'under_review' WHERE id = ?", [duelId]);
            console.log(`Dispute filed for duel ${duelId}. Winner was reported, pot held.`);
        } else {
            if (duel.challenger_id === reporterId) {
                await db.run('UPDATE duels SET challenger_seen_result = TRUE WHERE id = ?', [duelId]);
            } else {
                await db.run('UPDATE duels SET opponent_seen_result = TRUE WHERE id = ?', [duelId]);
            }
            console.log(`Dispute filed for duel ${duelId}. Loser was reported, pot will be paid out normally.`);
        }
        await db.run('COMMIT');
        res.status(201).json({ message: 'Dispute filed successfully. An admin will review it shortly.' });
    } catch (err) {
        await db.run('ROLLBACK').catch(console.error);
        console.error("Dispute Filing Error:", err.message);
        res.status(500).json({ message: 'An internal server error occurred.' });
    }
});


// --- Existing Duel Routes ---

router.get('/find-player', authenticateToken, query('roblox_username').trim().escape().notEmpty(), handleValidationErrors, async (req, res) => {
    try {
        const { roblox_username } = req.query;
        const player = await db.get('SELECT id, linked_roblox_username, avatar_url FROM users WHERE linked_roblox_username = ? AND id != ?', [roblox_username, req.user.userId]);
        if (!player) { return res.status(404).json({ message: 'Player not found or you searched for yourself.' }); }
        res.status(200).json(player);
    } catch(err) {
        console.error("Find Player Error:", err.message);
        res.status(500).json({ message: 'An internal server error occurred.' });
    }
});

// [MODIFIED] Updated to check the new 'status' column instead of 'is_banned'.
router.post('/challenge', authenticateToken,
    body('opponent_id').notEmpty(), body('wager').isInt({ gt: 0 }), body('map').trim().escape().notEmpty(),
    body('banned_weapons').isArray(), body('region').isIn(['Oceania', 'Europe', 'North America']),
    handleValidationErrors,
    async (req, res) => {
        try {
            const challenger_id = req.user.userId;
            // Query the new 'status' column
            const challenger = await db.get('SELECT status, ban_expires_at, ban_reason, gems FROM users WHERE id = ?', [challenger_id]);

            if (challenger?.status === 'banned') {
                const now = new Date();
                const expires = challenger.ban_expires_at ? new Date(challenger.ban_expires_at) : null;
                if (expires && now > expires) {
                    await db.run('UPDATE users SET status = \'active\', ban_reason = NULL, ban_expires_at = NULL, ban_applied_at = NULL WHERE id = ?', [challenger_id]);
                } else {
                    return res.status(403).json({ message: `You are currently banned for: ${challenger.ban_reason}` });
                }
            }
            
            const { opponent_id, wager, banned_weapons, map, region } = req.body;
            if (challenger.gems < wager) {
                return res.status(400).json({ message: 'You do not have enough gems for this wager.' });
            }

            const bannedWeaponsStr = JSON.stringify(banned_weapons || []);
            await db.run('INSERT INTO duels (challenger_id, opponent_id, wager, banned_weapons, map, region) VALUES (?, ?, ?, ?, ?, ?)', [challenger_id, opponent_id, wager, bannedWeaponsStr, map, region]);
            res.status(201).json({ message: 'Challenge sent!' });
        } catch(err) {
            console.error("Challenge Error:", err.message);
            res.status(500).json({ message: 'An internal server error occurred.' });
        }
    }
);

router.post('/:id/start', authenticateToken, param('id').isInt(), handleValidationErrors, async (req, res) => {
    const duelId = req.params.id;
    const userId = req.user.userId;
    try {
        const duel = await db.get('SELECT * FROM duels WHERE id = ? AND (challenger_id = ? OR opponent_id = ?)', [duelId, userId, userId]);
        if (!duel) { return res.status(404).json({ message: 'Duel not found or you are not a participant.' }); }
        if (duel.status !== 'accepted') { return res.status(400).json({ message: 'This duel cannot be started.' }); }
        await db.run("UPDATE duels SET status = 'started', started_at = CURRENT_TIMESTAMP WHERE id = ?", [duelId]);
        res.status(200).json({ message: 'Duel countdown started!', serverLink: duel.server_invite_link });
    } catch (err) {
        console.error(`[DUEL START] Error starting duel ${duelId}:`, err);
        res.status(500).json({ message: 'An internal server error occurred while starting the duel.' });
    }
});

router.post('/:id/forfeit', authenticateToken, param('id').isInt(), handleValidationErrors, async (req, res) => {
    const duelId = req.params.id;
    const forfeitingUserId = req.user.userId;
    try {
        await db.run('BEGIN TRANSACTION');
        const duel = await db.get('SELECT * FROM duels WHERE id = ?', [duelId]);
        if (!duel) { await db.run('ROLLBACK'); return res.status(404).json({ message: 'Duel not found.' }); }
        if (duel.status !== 'started') { await db.run('ROLLBACK'); return res.status(400).json({ message: 'You can only forfeit a started duel.' }); }
        if (duel.challenger_id !== forfeitingUserId && duel.opponent_id !== forfeitingUserId) { await db.run('ROLLBACK'); return res.status(403).json({ message: 'You are not a participant in this duel.' }); }
        const winnerId = (duel.challenger_id === forfeitingUserId) ? duel.opponent_id : duel.challenger_id;
        const loserId = forfeitingUserId;
        await db.run('UPDATE users SET gems = gems + ?, wins = wins + 1 WHERE id = ?', [duel.pot, winnerId]);
        await db.run('UPDATE users SET losses = losses + 1 WHERE id = ?', [loserId]);
        await db.run("UPDATE duels SET status = 'completed', winner_id = ? WHERE id = ?", [winnerId, duel.id]);
        await db.run('COMMIT');
        res.status(200).json({ message: 'You have forfeited the duel.' });
    } catch (err) {
        await db.run('ROLLBACK').catch(console.error);
        console.error(`[DUEL FORFEIT] Error forfeiting duel ${duelId}:`, err);
        res.status(500).json({ message: 'An internal server error occurred while forfeiting the duel.' });
    }
});

router.get('/pending', authenticateToken, async (req, res) => {
    // Deprecated in favor of /inbox
    res.status(200).json([]);
});

router.get('/history', authenticateToken, async(req, res) => {
    try {
        const sql = `
            SELECT d.id, d.wager, d.status, d.winner_id, d.challenger_id, c.linked_roblox_username as challenger_name, o.linked_roblox_username as opponent_name
            FROM duels d LEFT JOIN users c ON d.challenger_id = c.id LEFT JOIN users o ON d.opponent_id = o.id
            WHERE (d.challenger_id = ? OR d.opponent_id = ?) AND d.status IN ('completed', 'under_review', 'declined', 'canceled', 'cheater_forfeit')
            ORDER BY d.created_at DESC LIMIT 25
        `;
        const userId = req.user.userId;
        const duels = await db.all(sql, [userId, userId]);
        const history = duels.map(duel => ({
            id: duel.id, wager: duel.wager,
            opponent_name: duel.challenger_id === userId ? duel.opponent_name : duel.challenger_name || 'Unknown',
            outcome: duel.winner_id === userId ? 'win' : (duel.status === 'declined' || duel.status === 'canceled' ? 'declined' : 'loss'),
            status: duel.status
        }));
        res.status(200).json(history);
    } catch(err) {
        console.error("Get Duel History Error:", err.message);
        res.status(500).json({ message: 'An internal server error occurred.' });
    }
});

// [MODIFIED] Added a check to prevent banned users from accepting duels.
router.post('/respond', authenticateToken, body('duel_id').isInt(), body('response').isIn(['accept', 'decline']), handleValidationErrors, async (req, res) => {
    const { duel_id, response } = req.body;
    const opponentId = req.user.userId;
    try {
        await db.run('BEGIN TRANSACTION');
        const duel = await db.get('SELECT * FROM duels WHERE id = ? AND opponent_id = ? AND status = "pending"', [duel_id, opponentId]);
        if (!duel) { await db.run('ROLLBACK'); return res.status(404).json({ message: 'Duel not found, is not pending, or you are not the opponent.' }); }

        if (response === 'decline') {
            await db.run('UPDATE duels SET status = ? WHERE id = ?', ['declined', duel_id]);
            await db.run('COMMIT');
            return res.status(200).json({ message: 'Duel declined.' });
        } 
        
        // [NEW] Check if the opponent accepting the duel is banned.
        const opponent = await db.get('SELECT gems, status FROM users WHERE id = ?', [opponentId]);
        if (opponent.status === 'banned') {
            await db.run('ROLLBACK');
            return res.status(403).json({ message: 'You cannot accept duels while your account is banned.' });
        }

        const challenger = await db.get('SELECT gems FROM users WHERE id = ?', [duel.challenger_id]);
        if (!opponent || opponent.gems < duel.wager) { await db.run('ROLLBACK'); return res.status(400).json({ message: 'You do not have enough gems.' }); }
        if (!challenger || challenger.gems < duel.wager) { await db.run('ROLLBACK'); return res.status(400).json({ message: 'The challenger no longer has enough gems.' }); }

        await db.run('UPDATE users SET gems = gems - ? WHERE id = ?', [duel.wager, opponentId]);
        await db.run('UPDATE users SET gems = gems - ? WHERE id = ?', [duel.wager, duel.challenger_id]);
        const servers = await db.all('SELECT server_link FROM region_servers WHERE region = ? AND is_active = TRUE', [duel.region]);
        if (!servers || servers.length === 0) { await db.run('ROLLBACK'); return res.status(400).json({ message: `No available servers for the selected region (${duel.region}).` }); }
        
        const selectedServer = servers[Math.floor(Math.random() * servers.length)];
        const serverLink = selectedServer.server_link;
        const totalPot = duel.wager * 2;
        let taxCollected = 0;
        if (totalPot > 100) { taxCollected = Math.ceil(totalPot * 0.01); }
        const finalPot = totalPot - taxCollected;
        
        await db.run('UPDATE duels SET status = ?, server_invite_link = ?, accepted_at = CURRENT_TIMESTAMP, pot = ?, tax_collected = ? WHERE id = ?', ['accepted', serverLink, finalPot, taxCollected, duel_id]);
        
        const challengerInfo = await db.get('SELECT linked_roblox_username FROM users WHERE id = ?', [duel.challenger_id]);
        const opponentInfo = await db.get('SELECT linked_roblox_username FROM users WHERE id = ?', [duel.opponent_id]);
        const mapInfo = GAME_DATA.maps.find(m => m.id === duel.map);
        
        const taskPayload = {
            websiteDuelId: duel.id, serverLink: serverLink,
            challenger: challengerInfo.linked_roblox_username, opponent: opponentInfo.linked_roblox_username,
            map: mapInfo ? mapInfo.name : duel.map,
            bannedWeapons: JSON.parse(duel.banned_weapons || '[]').map(id => GAME_DATA.weapons.find(w => w.id === id)?.name || id),
            wager: duel.wager,
        };
        await db.run('INSERT INTO tasks (task_type, payload) VALUES (?, ?)', ['REFEREE_DUEL', JSON.stringify(taskPayload)]);
        await db.run('COMMIT');
        res.status(200).json({ message: 'Duel accepted! The bot has been notified.' });
    } catch(err) {
        await db.run('ROLLBACK').catch(console.error);
        console.error("Respond to Duel Error:", err.message);
        res.status(500).json({ message: 'An internal server error occurred.' });
    }
});

router.delete('/cancel/:id', authenticateToken, param('id').isInt(), handleValidationErrors, async (req, res) => {
    try {
        const duelId = req.params.id;
        const challengerId = req.user.userId;
        const duel = await db.get('SELECT status FROM duels WHERE id = ? AND challenger_id = ?', [duelId, challengerId]);
        if (!duel) { return res.status(404).json({ message: 'Duel not found or you are not the challenger.' }); }
        if (duel.status !== 'pending') { return res.status(403).json({ message: 'Cannot cancel a duel that has been accepted.' }); }
        await db.run('DELETE FROM duels WHERE id = ?', [duelId]);
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
        const duel = await db.get('SELECT transcript, challenger_id, opponent_id FROM duels WHERE id = ? AND (challenger_id = ? OR opponent_id = ?)', [duelId, userId, userId]);
        if (!duel) { return res.status(404).json({ message: 'Duel not found or you were not a participant.' }); }
        res.status(200).json(JSON.parse(duel.transcript || '[]'));
    } catch (err) {
        console.error("Get Transcript Error:", err.message);
        res.status(500).json({ message: 'An internal server error occurred.' });
    }
});

module.exports = router;