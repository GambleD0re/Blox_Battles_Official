// backend/routes/tasks.js
const express = require('express');
const db      = require('../database/database');
const { param } = require('express-validator');
const { handleValidationErrors } = require('../middleware/auth');
const util = require('util');

db.get = util.promisify(db.get);
db.all = util.promisify(db.all);
db.run = util.promisify(db.run);

const router  = express.Router();

// Middleware to protect task endpoints with the bot's API key
const authenticateBot = (req, res, next) => {
  const apiKey = req.headers['x-api-key'];
  if (!process.env.BOT_API_KEY) {
    console.error("FATAL ERROR: BOT_API_KEY is not defined in .env file.");
    return res.status(500).json({ message: 'Server configuration error: BOT_API_KEY missing.' });
  }
  if (!apiKey || apiKey !== process.env.BOT_API_KEY) {
    console.warn(`Unauthorized task access attempt from IP: ${req.ip}`);
    return res.status(401).json({ message: 'Unauthorized: Invalid or missing API key.' });
  }
  next();
};

// Endpoint for the bot to fetch pending tasks for a specific region
router.get('/:region', 
    authenticateBot,
    param('region').isIn(['Oceania', 'Europe', 'North America']).withMessage('Invalid region specified.'),
    handleValidationErrors,
    async (req, res) => {
        const { region } = req.params;
        try {
            await db.run('BEGIN TRANSACTION');

            // 1. Get all pending duel tasks
            const allPendingTasks = await db.all(
                "SELECT id, task_type, payload FROM tasks WHERE status = 'pending' AND task_type = 'REFEREE_DUEL'"
            );

            if (allPendingTasks.length === 0) {
                await db.run('COMMIT');
                return res.json([]);
            }

            // 2. Extract duel IDs from the task payloads
            const duelIdMap = new Map();
            allPendingTasks.forEach(task => {
                try {
                    const payload = JSON.parse(task.payload);
                    if (payload.websiteDuelId) {
                        duelIdMap.set(payload.websiteDuelId, task);
                    }
                } catch (e) {
                    console.error(`Could not parse payload for task ${task.id}:`, e);
                }
            });

            const duelIds = Array.from(duelIdMap.keys());
            if (duelIds.length === 0) {
                await db.run('COMMIT');
                return res.json([]);
            }
            
            // 3. Find which of those duels match the bot's region
            const placeholders = duelIds.map(() => '?').join(',');
            const sql = `SELECT id FROM duels WHERE id IN (${placeholders}) AND region = ?`;
            const regionalDuels = await db.all(sql, [...duelIds, region]);

            const regionalDuelIds = new Set(regionalDuels.map(d => d.id));

            // 4. Filter the original tasks to only include those for the correct region
            const tasksForBot = Array.from(duelIdMap.values()).filter(task => {
                const payload = JSON.parse(task.payload);
                return regionalDuelIds.has(payload.websiteDuelId);
            });

            // 5. Mark only the filtered tasks as 'processing'
            if (tasksForBot.length > 0) {
                const idsToUpdate = tasksForBot.map(t => t.id);
                const updatePlaceholders = idsToUpdate.map(() => '?').join(',');
                await db.run(`UPDATE tasks SET status = 'processing' WHERE id IN (${updatePlaceholders})`, idsToUpdate);
            }

            await db.run('COMMIT');
            res.json(tasksForBot);
        } catch (err) {
            await db.run('ROLLBACK').catch(console.error);
            console.error('Task Fetch Error:', err);
            res.status(500).json({ message: 'Failed to fetch tasks.' });
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
        const result = await db.run(
            'UPDATE tasks SET status = ?, completed_at = CURRENT_TIMESTAMP WHERE id = ? AND status = ?',
            ['completed', taskId, 'processing']
        );
        if (result.changes > 0) {
            res.status(200).json({ message: `Task ${taskId} marked as completed.` });
        } else {
            res.status(404).json({ message: 'Task not found or not in processing state.' });
        }
    } catch (err) {
        console.error(`Error completing task ${taskId}:`, err.message);
        res.status(500).json({ message: 'Failed to complete task.' });
    }
});

module.exports = router;
