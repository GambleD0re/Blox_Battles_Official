const express = require('express');
const { body, param } = require('express-validator');
const db = require('../database/database');
const { authenticateToken, handleValidationErrors, authenticateBot } = require('../middleware/auth');

const router = express.Router();

router.post('/',
    authenticateToken,
    [
        body('subject').trim().notEmpty().withMessage('Subject is required.'),
        body('message').trim().notEmpty().withMessage('Message is required.')
    ],
    handleValidationErrors,
    async (req, res) => {
        const { subject, message } = req.body;
        const userId = req.user.userId;
        const client = await db.getPool().connect();

        try {
            await client.query('BEGIN');

            const { rows: [user] } = await client.query('SELECT discord_id FROM users WHERE id = $1', [userId]);
            if (!user || !user.discord_id) {
                await client.query('ROLLBACK');
                return res.status(400).json({ message: 'You must link your Discord account before creating a support ticket.' });
            }

            const { rows: [newTicket] } = await client.query(
                `INSERT INTO tickets (user_id, type, subject) VALUES ($1, 'support', $2) RETURNING id`,
                [userId, subject]
            );
            const ticketId = newTicket.id;

            await client.query(
                'INSERT INTO ticket_messages (ticket_id, author_id, message) VALUES ($1, $2, $3)',
                [ticketId, userId, message]
            );

            const taskPayload = {
                ticket_id: ticketId,
                user_discord_id: user.discord_id,
                ticket_type: 'support',
                subject: subject
            };
            await client.query("INSERT INTO tasks (task_type, payload) VALUES ('CREATE_TICKET_CHANNEL', $1)", [JSON.stringify(taskPayload)]);
            
            await client.query('COMMIT');
            res.status(201).json({ message: 'Support ticket created successfully. A private channel has been opened for you in our Discord server.' });

        } catch (error) {
            await client.query('ROLLBACK');
            console.error("Create Support Ticket Error:", error);
            res.status(500).json({ message: 'An internal server error occurred while creating the ticket.' });
        } finally {
            client.release();
        }
    }
);

router.get('/', authenticateToken, async (req, res) => {
    const userId = req.user.userId;
    try {
        const { rows } = await db.query(
            'SELECT id, type, status, subject, created_at, resolved_at FROM tickets WHERE user_id = $1 ORDER BY created_at DESC',
            [userId]
        );
        res.status(200).json(rows);
    } catch (error) {
        console.error("Fetch User Tickets Error:", error);
        res.status(500).json({ message: 'Failed to fetch ticket history.' });
    }
});

router.get('/:id/details', authenticateBot, param('id').isUUID(), handleValidationErrors, async (req, res) => {
    try {
        const { id } = req.params;
        const sql = `
            SELECT t.id, t.user_id, u.discord_id 
            FROM tickets t 
            JOIN users u ON t.user_id = u.id 
            WHERE t.id = $1`;
        const { rows: [ticket] } = await db.query(sql, [id]);
        if (!ticket) {
            return res.status(404).json({ message: 'Ticket not found.' });
        }
        res.status(200).json(ticket);
    } catch (error) {
        console.error("Get Ticket Details Error:", error);
        res.status(500).json({ message: 'Failed to fetch ticket details.' });
    }
});

router.post('/:id/transcript', authenticateBot, param('id').isUUID(), body('content').isString().notEmpty(), handleValidationErrors, async (req, res) => {
    try {
        const { id } = req.params;
        const { content } = req.body;
        await db.query(
            'INSERT INTO ticket_transcripts (ticket_id, transcript_content) VALUES ($1, $2)',
            [id, content]
        );
        res.status(201).json({ message: 'Transcript saved successfully.' });
    } catch (error) {
        console.error("Save Transcript Error:", error);
        res.status(500).json({ message: 'Failed to save transcript.' });
    }
});

module.exports = router;
