// backend/routes/inbox.js
const express = require('express');
const db = require('../database/database');
const { authenticateToken } = require('../middleware/auth');

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
            WHERE (d.opponent_id = $1 OR d.challenger_id = $1) AND d.status IN ('pending', 'accepted', 'started', 'under_review')
        `;
        const { rows: activeDuels } = await db.query(duelSql, [userId]);
        
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
            WHERE user_id = $1 AND status IN ('awaiting_approval', 'approved')
        `;
        const { rows: payoutRequests } = await db.query(payoutSql, [userId]);

        payoutRequests.forEach(request => {
            allNotifications.push({
                id: `payout-${request.id}`,
                type: 'withdrawal_request',
                timestamp: request.created_at,
                data: request
            });
        });

        // 3. Fetch static messages
        const messageSql = `
            SELECT id, title, message, reference_id, created_at 
            FROM inbox_messages 
            WHERE user_id = $1 AND is_read = FALSE
        `;
        const { rows: messages } = await db.query(messageSql, [userId]);
        
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
