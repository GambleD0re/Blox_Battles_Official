// backend/routes/subscriptions.js
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
            // Use ON CONFLICT to handle new subscriptions or update existing ones for the user.
            const sql = `
                INSERT INTO push_subscriptions (user_id, subscription) VALUES ($1, $2)
                ON CONFLICT (user_id) DO UPDATE SET subscription = $2
            `;
            await db.query(sql, [userId, subscriptionJson]);
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

module.exports = router;```

---

#### **8. `backend/routes/tasks.js` (Fully Refactored)**

This route allows the bot to fetch and complete tasks.

```javascript
// backend/routes/tasks.js
const express = require('express');
const db = require('../database/database');
const { param } = require('express-validator');
const { handleValidationErrors, authenticateBot } = require('../middleware/auth');

const router = express.Router();

// Endpoint for the bot to fetch pending tasks for a specific region
router.get('/:region', 
    authenticateBot,
    param('region').isIn(['Oceania', 'Europe', 'North America']).withMessage('Invalid region specified.'),
    handleValidationErrors,
    async (req, res) => {
        const { region } = req.params;
        const client = await db.getPool().connect();
        try {
            await client.query('BEGIN');
            
            // Find duel tasks that are pending and whose duel's region matches the bot's region.
            // Lock the tasks and duels to prevent race conditions.
            const sql = `
                SELECT t.id, t.task_type, t.payload
                FROM tasks t
                JOIN duels d ON (t.payload->>'websiteDuelId')::int = d.id
                WHERE t.status = 'pending' AND t.task_type = 'REFEREE_DUEL' AND d.region = $1
                FOR UPDATE of t, d;
            `;
            const { rows: tasksForBot } = await client.query(sql, [region]);

            if (tasksForBot.length > 0) {
                const idsToUpdate = tasksForBot.map(t => t.id);
                await client.query(`UPDATE tasks SET status = 'processing' WHERE id = ANY($1::int[])`, [idsToUpdate]);
            }

            await client.query('COMMIT');
            res.json(tasksForBot);
        } catch (err) {
            await client.query('ROLLBACK');
            console.error('Task Fetch Error:', err);
            res.status(500).json({ message: 'Failed to fetch tasks.' });
        } finally {
            client.release();
        }
});

// Endpoint for the bot to mark a task as completed
router.post('/:id/complete', 
    authenticateBot,
    param('id').isInt().withMessage('Invalid task ID.'),
    handleValidationErrors,
    async (req, res) => {
        const taskId = req.params.id;
        try {
            const { rowCount } = await db.query(
                "UPDATE tasks SET status = 'completed', completed_at = NOW() WHERE id = $1 AND status = 'processing'",
                [taskId]
            );
            
            if (rowCount > 0) {
                res.status(200).json({ message: `Task ${taskId} marked as completed.` });
            } else {
                res.status(404).json({ message: 'Task not found or not in processing state.' });
            }
        } catch (err) {
            console.error(`Error completing task ${taskId}:`, err.message);
            res.status(500).json({ message: 'Failed to complete task.' });
        }
    }
);

module.exports = router;
