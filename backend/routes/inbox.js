// backend/routes/inbox.js
// This new file provides a unified endpoint for all user-facing notifications.

const express = require('express');
const db = require('../database/database');
const { authenticateToken } = require('../middleware/auth');
const GAME_DATA = require('../game-data-store');

const router = express.Router();

// GET all notifications for the logged-in user
router.get('/', authenticateToken, async (req, res) => {
    const userId = req.user.userId;
    let allNotifications = [];

    try {
        // 1. Fetch active duel notifications
        const duelSql = `
            SELECT 
                d.id, d.wager, d.map, d.status, d.banned_weapons, d.challenger_id, d.opponent_id, d.server_invite_link, d.created_at,
                challenger.linked_roblox_username as challenger_username,
                opponent.linked_roblox_username as opponent_username
            FROM duels d
            JOIN users challenger ON d.challenger_id = challenger.id
            JOIN users opponent ON d.opponent_id = opponent.id
            WHERE (d.opponent_id = ? OR d.challenger_id = ?) AND d.status IN ('pending', 'accepted', 'started', 'under_review')
        `;
        const activeDuels = await db.all(duelSql, [userId, userId]);
        
        activeDuels.forEach(duel => {
            allNotifications.push({
                id: `duel-${duel.id}`,
                type: 'duel',
                timestamp: duel.created_at,
                data: duel 
            });
        });

        // 2. Fetch pending and approved withdrawal requests
        const payoutSql = `
            SELECT id, amount_gems, type, status, created_at 
            FROM payout_requests 
            WHERE user_id = ? AND status IN ('awaiting_approval', 'approved')
        `;
        const payoutRequests = await db.all(payoutSql, [userId]);

        payoutRequests.forEach(request => {
            allNotifications.push({
                id: `payout-${request.id}`,
                type: 'withdrawal_request',
                timestamp: request.created_at,
                data: request
            });
        });

        // 3. Fetch static messages (like declined withdrawal notifications)
        const messageSql = `
            SELECT id, title, message, reference_id, created_at 
            FROM inbox_messages 
            WHERE user_id = ? AND is_read = FALSE
        `;
        const messages = await db.all(messageSql, [userId]);
        
        messages.forEach(message => {
            allNotifications.push({
                id: `message-${message.id}`,
                type: 'admin_message',
                timestamp: message.created_at,
                data: message
            });
        });

        // 4. Sort all notifications by timestamp, newest first
        allNotifications.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        res.status(200).json(allNotifications);

    } catch (err) {
        console.error("Unified Inbox Fetch Error:", err.message);
        res.status(500).json({ message: 'An internal server error occurred while fetching notifications.' });
    }
});

module.exports = router;