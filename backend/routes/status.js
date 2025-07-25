// backend/routes/status.js
const express = require('express');
const { body } = require('express-validator');
// This import will now work correctly because authenticateBot is exported from auth.js
const { authenticateToken, authenticateBot, handleValidationErrors } = require('../middleware/auth');

const router = express.Router();

// In-memory store for bot heartbeats.
// Key: Region Name (e.g., "North America")
// Value: Timestamp of the last heartbeat (e.g., 1678886400000)
const botStatus = new Map();

const BOT_OFFLINE_THRESHOLD = 45 * 1000; // 45 seconds

// --- ROUTES ---

// Endpoint for bots to send their heartbeat
router.post('/heartbeat',
    authenticateBot, // This is now a valid function
    body('region').isIn(['Oceania', 'Europe', 'North America']),
    handleValidationErrors,
    (req, res) => {
        const { region } = req.body;
        botStatus.set(region, Date.now());
        // console.log(`[Heartbeat] Received heartbeat from ${region} region bot.`);
        res.status(200).json({ message: 'Heartbeat received.' });
    }
);

// Endpoint for the frontend to get the live status of all regional bots
router.get('/', authenticateToken, (req, res) => {
    const regions = ['North America', 'Europe', 'Oceania'];
    const now = Date.now();

    const statuses = regions.map(region => {
        const lastHeartbeat = botStatus.get(region);
        const isOnline = lastHeartbeat && (now - lastHeartbeat < BOT_OFFLINE_THRESHOLD);
        
        return {
            region: region,
            status: isOnline ? 'online' : 'offline'
        };
    });

    res.status(200).json(statuses);
});

module.exports = router;
