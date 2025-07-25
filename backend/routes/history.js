// backend/routes/history.js
// This new file provides a dedicated endpoint for fetching a user's transaction history.

const express = require('express');
const db = require('../database/database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// GET the transaction history for the logged-in user
router.get('/', authenticateToken, async (req, res) => {
    const userId = req.user.userId;

    try {
        const sql = `
            SELECT 
                id,
                type,
                amount_gems,
                description,
                reference_id,
                created_at
            FROM transaction_history
            WHERE user_id = ?
            ORDER BY created_at DESC
            LIMIT 100; -- Limit to the last 100 transactions for performance
        `;

        const history = await db.all(sql, [userId]);

        res.status(200).json(history);

    } catch (err) {
        console.error("Fetch Transaction History Error:", err.message);
        res.status(500).json({ message: 'An internal server error occurred while fetching your transaction history.' });
    }
});

module.exports = router;