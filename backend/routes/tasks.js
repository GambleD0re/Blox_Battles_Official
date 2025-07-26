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

            // [FIX] Reverting to the original, more robust logic.
            // 1. Get all pending duel tasks from the 'tasks' table.
            const { rows: allPendingTasks } = await client.query(
                "SELECT id, task_type, payload FROM tasks WHERE status = 'pending' AND task_type = 'REFEREE_DUEL' FOR UPDATE"
            );

            if (allPendingTasks.length === 0) {
                await client.query('COMMIT');
                return res.json([]);
            }

            // 2. Extract the websiteDuelId from each task's payload.
            const duelIdMap = new Map();
            allPendingTasks.forEach(task => {
                // The payload is already a JS object from the DB driver.
                if (task.payload && task.payload.websiteDuelId) {
                    duelIdMap.set(task.payload.websiteDuelId, task);
                }
            });

            const duelIds = Array.from(duelIdMap.keys());
            if (duelIds.length === 0) {
                await client.query('COMMIT');
                return res.json([]);
            }
            
            // 3. Find which of those duels match the bot's region from the 'duels' table.
            const sql = `SELECT id FROM duels WHERE id = ANY($1::int[]) AND region = $2`;
            const { rows: regionalDuels } = await client.query(sql, [duelIds, region]);

            const regionalDuelIds = new Set(regionalDuels.map(d => d.id));

            // 4. Filter the original tasks to only include those for the correct region.
            const tasksForBot = Array.from(duelIdMap.values()).filter(task => {
                return regionalDuelIds.has(task.payload.websiteDuelId);
            });

            // 5. Mark only the filtered tasks as 'processing'.
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
