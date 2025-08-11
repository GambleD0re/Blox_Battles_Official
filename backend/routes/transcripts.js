const express = require('express');
const { param } = require('express-validator');
const db = require('../database/database');
const { handleValidationErrors } = require('../middleware/auth');

const router = express.Router();

router.get('/:id', param('id').isInt(), handleValidationErrors, async (req, res) => {
    try {
        const duelId = req.params.id;
        const sql = `
            SELECT 
                d.id,
                d.transcript,
                d.map,
                d.wager,
                d.pot,
                c.linked_roblox_username as challenger_username,
                o.linked_roblox_username as opponent_username,
                w.linked_roblox_username as winner_username
            FROM duels d
            JOIN users c ON d.challenger_id = c.id
            JOIN users o ON d.opponent_id = o.id
            LEFT JOIN users w ON d.winner_id = w.id
            WHERE d.id = $1;
        `;
        const { rows: [duel] } = await db.query(sql, [duelId]);

        if (!duel) {
            return res.status(404).json({ message: 'Transcript not found.' });
        }

        res.status(200).json(duel);
    } catch (err) {
        console.error("Fetch Public Transcript Error:", err);
        res.status(500).json({ message: 'Failed to fetch transcript.' });
    }
});

router.get('/ticket/:id', param('id').isUUID(), handleValidationErrors, async (req, res) => {
    try {
        const ticketId = req.params.id;
        const sql = `SELECT transcript_content FROM ticket_transcripts WHERE ticket_id = $1::uuid ORDER BY created_at DESC LIMIT 1`;
        const { rows: [transcript] } = await db.query(sql, [ticketId]);

        if (!transcript) {
            return res.status(404).json({ message: 'Ticket transcript not found.' });
        }

        res.header('Content-Type', 'text/plain');
        res.send(transcript.transcript_content);
    } catch (err) {
        console.error("Fetch Ticket Transcript Error:", err);
        res.status(500).json({ message: 'Failed to fetch ticket transcript.' });
    }
});

module.exports = router;
