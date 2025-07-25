// backend/routes/status.js
const express = require('express');
const { body } = require('express-validator');
const { authenticateToken, authenticateBot, handleValidationErrors } = require('../middleware/auth');

const router = express.Router();

const botStatus = new Map();
const BOT_OFFLINE_THRESHOLD = 45 * 1000;

// [NEW] Health check route for Render
// This is a public route that does not require authentication.
router.get('/status', (req, res) => {
    // A 200 OK response tells Render that the server is up and running.
    res.status(200).json({ status: 'ok' });
});

router.post('/heartbeat',
    authenticateBot,
    body('region').isIn(['Oceania', 'Europe', 'North America']),
    handleValidationErrors,
    (req, res) => {
        const { region } = req.body;
        botStatus.set(region, Date.now());
        res.status(200).json({ message: 'Heartbeat received.' });
    }
);

router.get('/', authenticateToken, (req, res) => {
    const regions = ['North America', 'Europe', 'Oceania'];
    const now = Date.now();
    const statuses = regions.map(region => {
        const lastHeartbeat = botStatus.get(region);
        const isOnline = lastHeartbeat && (now - lastHeartbeat < BOT_OFFLINE_THRESHOLD);
        return { region, status: isOnline ? 'online' : 'offline' };
    });
    res.status(200).json(statuses);
});

module.exports = router;
