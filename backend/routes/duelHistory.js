// backend/routes/duelHistory.js
const express = require('express');
const db = require('../database/database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// GET the detailed duel history for the logged-in user
router.get('/', authenticateToken, async (req, res) => {
    const userId = req.user.userId;

    try {
        const sql = `
            SELECT 
                d.id,
                d.wager,
                d.pot,
                d.status,
                d.winner_id,
                d.challenger_id,
                d.opponent_id,
                d.transcript,
                d.created_at,
                challenger.linked_roblox_username as challenger_username,
                challenger.avatar_url as challenger_avatar,
                opponent.linked_roblox_username as opponent_username,
                opponent.avatar_url as opponent_avatar
            FROM duels d
            JOIN users challenger ON d.challenger_id = challenger.id
            JOIN users opponent ON d.opponent_id = opponent.id
            WHERE 
                (d.challenger_id = $1 OR d.opponent_id = $1) 
                AND d.status IN ('completed', 'canceled', 'declined', 'cheater_forfeit', 'under_review')
            ORDER BY d.created_at DESC
            LIMIT 100;
        `;

        const { rows: history } = await db.query(sql, [userId]);
        
        // No need to parse JSONB from the database, it's handled by the driver
        res.status(200).json(history);

    } catch (err) {
        console.error("Fetch Detailed Duel History Error:", err.message);
        res.status(500).json({ message: 'An internal server error occurred while fetching your duel history.' });
    }
});

module.exports = router;
