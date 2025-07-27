// backend/routes/tasks.js
const express = require('express');
const db = require('../database/database');
const { param } = require('express-validator');
const { handleValidationErrors, authenticateBot } = require('../middleware/auth');

const router = express.Router();

// [MODIFIED] Endpoint for a bot to fetch pending tasks for its specific serverId.
router.get('/:serverId', 
    authenticateBot,
    param('serverId').matches(/^[A-Z]{2,3}(?:-[A-Za-z]+)?_[0-9]+$/).withMessage('Invalid serverId format.'),
    handleValidationErrors,
    async (req, res) => {
        const { serverId } = req.params;
        const client = await db.getPool().connect();
        try {
            await client.query('BEGIN');

            const sql = `
                SELECT id, task_type, payload 
                FROM tasks 
                WHERE status = 'pending' 
                  AND task_type = 'REFEREE_DUEL' 
                  AND payload->>'serverId' = $1
                FOR UPDATE OF tasks
            `;
            
            const { rows: tasksForBot } = await client.query(sql, [serverId]);

            if (tasksForBot.length > 0) {
                const idsToUpdate = tasksForBot.map(t => t.id);
                await client.query(`UPDATE tasks SET status = 'processing' WHERE id = ANY($1::int[])`, [idsToUpdate]);
            }

            await client.query('COMMIT');
            res.json(tasksForBot);
        } catch (err) {
            await client.query('ROLLBACK');
            console.error(`Task Fetch Error for server ${serverId}:`, err);
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
