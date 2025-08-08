// backend/routes/inbox.js
const express = require('express');
const db = require('../database/database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// GET /api/inbox - Fetch all notifications for the logged-in user
router.get('/', authenticateToken, async (req, res) => {
    const userId = req.user.userId;
    const client = await db.getPool().connect();
    let notifications = [];

    try {
        // 1. Fetch pending, accepted, and started duels
        const duelsSql = `
            SELECT 
                d.id, d.wager, d.status, d.challenger_id, d.server_invite_link,
                c.linked_roblox_username as challenger_username,
                o.linked_roblox_username as opponent_username,
                gm.name as map_name
            FROM duels d
            JOIN users c ON d.challenger_id = c.id
            JOIN users o ON d.opponent_id = o.id
            LEFT JOIN gamedata_maps gm ON d.map = gm.id
            WHERE 
                (d.challenger_id = $1 OR d.opponent_id = $1) AND
                d.status IN ('pending', 'accepted', 'started', 'under_review')
        `;
        const { rows: duels } = await client.query(duelsSql, [userId]);
        duels.forEach(duel => {
            notifications.push({
                id: `duel-${duel.id}`,
                type: 'duel',
                timestamp: duel.created_at,
                data: {
                    ...duel,
                    type: duel.challenger_id.toString() === userId ? 'outgoing' : 'incoming',
                    userId: userId
                }
            });
        });

        // 2. Fetch pending and approved withdrawal requests
        const withdrawalsSql = `
            SELECT id, amount_gems, status, created_at FROM payout_requests
            WHERE user_id = $1 AND status IN ('awaiting_approval', 'approved')
        `;
        const { rows: withdrawals } = await client.query(withdrawalsSql, [userId]);
        withdrawals.forEach(req => {
            notifications.push({
                id: `withdrawal-${req.id}`,
                type: 'withdrawal_request',
                timestamp: req.created_at,
                data: req
            });
        });

        // 3. Fetch unread inbox messages (admin, discord link, etc.)
        const messagesSql = `
            SELECT id, type, title, message, reference_id, created_at FROM inbox_messages
            WHERE user_id = $1 AND is_read = FALSE
        `;
        const { rows: messages } = await client.query(messagesSql, [userId]);
        messages.forEach(msg => {
            notifications.push({
                id: `message-${msg.id}`,
                type: msg.type,
                timestamp: msg.created_at,
                data: msg
            });
        });

        // Sort all notifications by date, newest first
        notifications.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

        res.status(200).json(notifications);

    } catch (err) {
        console.error("Fetch Inbox Error:", err.message);
        res.status(500).json({ message: 'An internal server error occurred while fetching your inbox.' });
    } finally {
        client.release();
    }
});

module.exports = router;
