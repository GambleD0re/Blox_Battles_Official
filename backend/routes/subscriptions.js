// backend/routes/subscriptions.js
// Handles saving and managing push notification subscriptions.

const express = require('express');
const { body } = require('express-validator');
const db = require('../database/database');
const { authenticateToken, handleValidationErrors } = require('../middleware/auth');

const router = express.Router();

// Save a push subscription to the database
router.post('/save', authenticateToken,
    body('subscription').isObject().withMessage('Subscription object is required.'),
    handleValidationErrors,
    async (req, res) => {
        const { subscription } = req.body;
        const userId = req.user.userId;

        try {
            const subscriptionJson = JSON.stringify(subscription);
            // Use INSERT OR REPLACE to handle new subscriptions or update existing ones for the user
            const sql = 'INSERT OR REPLACE INTO push_subscriptions (user_id, subscription) VALUES (?, ?)';
            await db.run(sql, [userId, subscriptionJson]);
            res.status(201).json({ message: 'Subscription saved successfully.' });
        } catch (err) {
            console.error("Save Subscription Error:", err.message);
            res.status(500).json({ message: 'Failed to save subscription.' });
        }
    }
);

// Endpoint to get the VAPID public key from the frontend
router.get('/vapid-public-key', (req, res) => {
    if (!process.env.VAPID_PUBLIC_KEY) {
        return res.status(500).json({ message: 'VAPID public key not configured on server.' });
    }
    res.status(200).json({ publicKey: process.env.VAPID_PUBLIC_KEY });
});

module.exports = router;
