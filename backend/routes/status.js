const express = require('express');
const { body } = require('express-validator');
const { authenticateToken, authenticateBot, handleValidationErrors } = require('../middleware/auth');
const db = require('../database/database');

const router = express.Router();

router.get('/health', (req, res) => {
    res.status(200).json({ status: 'ok' });
});

router.get('/features', async (req, res) => {
    try {
        const { rows } = await db.query('SELECT feature_name, is_enabled, disabled_message FROM system_status');
        const systemStatus = rows.reduce((acc, flag) => {
            acc[flag.feature_name] = {
                isEnabled: flag.is_enabled,
                message: flag.disabled_message
            };
            return acc;
        }, {});
        res.status(200).json(systemStatus);
    } catch (err) {
        console.error("Public Get System Status Error:", err);
        res.status(500).json({ message: 'Failed to fetch system feature status.' });
    }
});

router.get('/', authenticateBot, async (req, res) => {
    try {
        const BOT_OFFLINE_THRESHOLD_SECONDS = 45;
        const sql = `
            SELECT server_id, region, player_count, last_heartbeat 
            FROM game_servers
            WHERE last_heartbeat >= NOW() - INTERVAL '${BOT_OFFLINE_THRESHOLD_SECONDS} seconds'
            ORDER BY region, server_id
        `;
        const { rows: servers } = await db.query(sql);
        res.status(200).json(servers);
    } catch (err) {
        console.error("[STATUS] Error fetching active servers:", err);
        res.status(500).json({ message: 'An internal server error occurred.' });
    }
});

router.get('/player-count', authenticateBot, async (req, res) => {
    try {
        const { rows: [result] } = await db.query("SELECT COUNT(id)::int FROM users WHERE status != 'terminated'");
        res.status(200).json({ playerCount: result.count });
    } catch (err) {
        console.error("[STATUS] Error fetching player count:", err);
        res.status(500).json({ message: 'Failed to fetch player count.' });
    }
});


router.post('/heartbeat',
    authenticateBot,
    [
        body('serverId').matches(/^[A-Z]{2,3}(?:-[A-Za-z]+)?_[0-9]+$/).withMessage('Invalid serverId format (e.g., NA-East_1, EU_1).'),
        body('joinLink').isURL().withMessage('A valid joinLink URL is required.')
    ],
    handleValidationErrors,
    async (req, res) => {
        const { serverId, joinLink } = req.body;
        
        const region = serverId.substring(0, serverId.lastIndexOf('_'));

        try {
            const sql = `
                INSERT INTO game_servers (server_id, region, join_link, last_heartbeat)
                VALUES ($1, $2, $3, NOW())
                ON CONFLICT (server_id) DO UPDATE SET
                    join_link = EXCLUDED.join_link,
                    last_heartbeat = NOW();
            `;
            await db.query(sql, [serverId, region, joinLink]);
            res.status(200).json({ message: `Heartbeat received and processed for ${serverId}.` });
        } catch (err) {
            console.error(`[HEARTBEAT] Error processing heartbeat for ${serverId}:`, err);
            res.status(500).json({ message: 'An internal server error occurred while processing the heartbeat.' });
        }
    }
);

module.exports = router;
