// backend/routes/tasks.js
const express = require('express');
const db = require('../database/database'); // CORRECTED PATH
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
