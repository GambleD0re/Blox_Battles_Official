--- START OF FILE queue.js ---
// backend/routes/queue.js
const express = require('express');
const { body } = require('express-validator');
const db = require('../database/database');
const { authenticateToken, handleValidationErrors } = require('../middleware/auth');
const GAME_DATA = require('../game-data-store');

const router = express.Router();

const QUEUE_LEAVE_COOLDOWN_SECONDS = 60;

// GET /api/queue/status - Check if the user is currently in the queue
router.get('/status', authenticateToken, async (req, res) => {
    try {
        const { rows: [queueEntry] } = await db.query(
            'SELECT * FROM random_queue_entries WHERE user_id = $1',
            [req.user.userId]
        );
        res.status(200).json(queueEntry || null);
    } catch (err) {
        console.error("Get Queue Status Error:", err);
        res.status(500).json({ message: 'Failed to retrieve queue status.' });
    }
});

// POST /api/queue/join - Enter the random matchmaking queue
router.post('/join',
    authenticateToken,
    [
        body('wager').isInt({ gt: 0 }),
        body('region').isIn(GAME_DATA.regions.map(r => r.id)),
        body('banned_map').isString().notEmpty(),
        body('banned_weapons').isArray({ min: 0, max: 2 })
    ],
    handleValidationErrors,
    async (req, res) => {
        const { wager, region, banned_map, banned_weapons } = req.body;
        const userId = req.user.userId;
        const client = await db.getPool().connect();

        try {
            await client.query('BEGIN');
            const { rows: [user] } = await client.query(
                `SELECT gems, last_queue_leave_at FROM users WHERE id = $1 FOR UPDATE`,
                [userId]
            );

            if (user.last_queue_leave_at) {
                const now = new Date();
                const lastLeave = new Date(user.last_queue_leave_at);
                const secondsSinceLeave = (now.getTime() - lastLeave.getTime()) / 1000;
                if (secondsSinceLeave < QUEUE_LEAVE_COOLDOWN_SECONDS) {
                    const cooldownRemaining = Math.ceil(QUEUE_LEAVE_COOLDOWN_SECONDS - secondsSinceLeave);
                    await client.query('ROLLBACK');
                    return res.status(429).json({ message: `You must wait ${cooldownRemaining} more seconds before joining the queue again.` });
                }
            }

            if (parseInt(user.gems) < parseInt(wager)) {
                await client.query('ROLLBACK');
                return res.status(400).json({ message: 'Insufficient gems for this wager.' });
            }

            const insertSql = `
                INSERT INTO random_queue_entries (user_id, region, wager, banned_map, banned_weapons)
                VALUES ($1, $2, $3, $4, $5)
                ON CONFLICT (user_id) DO NOTHING
            `;
            await client.query(insertSql, [userId, region, wager, banned_map, JSON.stringify(banned_weapons)]);
            
            await client.query('COMMIT');
            res.status(200).json({ message: 'You have joined the queue.' });

        } catch (err) {
            await client.query('ROLLBACK');
            console.error("Join Queue Error:", err);
            res.status(500).json({ message: 'An error occurred while joining the queue.' });
        } finally {
            client.release();
        }
    }
);

// POST /api/queue/leave - Exit the random matchmaking queue
router.post('/leave', authenticateToken, async (req, res) => {
    const userId = req.user.userId;
    const client = await db.getPool().connect();

    try {
        await client.query('BEGIN');
        await client.query('DELETE FROM random_queue_entries WHERE user_id = $1', [userId]);
        await client.query('UPDATE users SET last_queue_leave_at = NOW() WHERE id = $1', [userId]);
        await client.query('COMMIT');
        res.status(200).json({ message: 'You have left the queue.' });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error("Leave Queue Error:", err);
        res.status(500).json({ message: 'An error occurred while leaving the queue.' });
    } finally {
        client.release();
    }
});

module.exports = router;
