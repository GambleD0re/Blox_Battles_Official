// backend/routes/tournaments.js
const express = require('express');
const { param } = require('express-validator');
const db = require('../database/database');
const { authenticateToken, handleValidationErrors } = require('../middleware/auth');

const router = express.Router();

// GET all visible tournaments
router.get('/', authenticateToken, async (req, res) => {
    try {
        const sql = `
            SELECT
                t.id,
                t.name,
                t.region,
                t.buy_in_amount,
                t.prize_pool_gems,
                t.starts_at,
                t.status,
                t.capacity,
                COUNT(tp.user_id)::int AS registered_players
            FROM tournaments t
            LEFT JOIN tournament_participants tp ON t.id = tp.tournament_id
            WHERE t.status IN ('scheduled', 'registration_open', 'active', 'completed', 'dispute_period', 'finalized') -- [CORRECTED] Added 'scheduled' to the list of visible statuses
            GROUP BY t.id
            ORDER BY t.starts_at DESC;
        `;
        const { rows: tournaments } = await db.query(sql);
        res.status(200).json(tournaments);
    } catch (err) {
        console.error("Fetch Tournaments Error:", err);
        res.status(500).json({ message: 'Failed to fetch tournaments.' });
    }
});

// GET detailed information for a single tournament
router.get('/:id', authenticateToken, param('id').isUUID(), handleValidationErrors, async (req, res) => {
    try {
        const tournamentId = req.params.id;
        const tournamentSql = `SELECT * FROM tournaments WHERE id = $1`;
        const { rows: [tournament] } = await db.query(tournamentSql, [tournamentId]);
        if (!tournament) {
            return res.status(404).json({ message: 'Tournament not found.' });
        }

        const matchesSql = `
            SELECT
                tm.round_number,
                tm.match_in_round,
                p1.linked_roblox_username AS player1_username,
                p2.linked_roblox_username AS player2_username,
                winner.linked_roblox_username AS winner_username
            FROM tournament_matches tm
            LEFT JOIN users p1 ON tm.player1_id = p1.id
            LEFT JOIN users p2 ON tm.player2_id = p2.id
            LEFT JOIN users winner ON tm.winner_id = winner.id
            WHERE tm.tournament_id = $1
            ORDER BY tm.round_number, tm.match_in_round;
        `;
        const { rows: matches } = await db.query(matchesSql, [tournamentId]);

        res.status(200).json({ ...tournament, matches });
    } catch (err) {
        console.error("Fetch Tournament Details Error:", err);
        res.status(500).json({ message: 'Failed to fetch tournament details.' });
    }
});

// POST to register for a tournament
router.post('/:id/register', authenticateToken, param('id').isUUID(), handleValidationErrors, async (req, res) => {
    const tournamentId = req.params.id;
    const userId = req.user.userId;
    const client = await db.getPool().connect();

    try {
        await client.query('BEGIN');

        const { rows: [tournament] } = await client.query("SELECT * FROM tournaments WHERE id = $1 FOR UPDATE", [tournamentId]);
        if (!tournament) {
            await client.query('ROLLBACK');
            return res.status(404).json({ message: 'Tournament not found.' });
        }
        if (tournament.status !== 'registration_open') {
            await client.query('ROLLBACK');
            return res.status(403).json({ message: 'Registration for this tournament is not currently open.' });
        }

        const { rows: [user] } = await client.query("SELECT gems FROM users WHERE id = $1 FOR UPDATE", [userId]);
        if (parseInt(user.gems) < parseInt(tournament.buy_in_amount)) {
            await client.query('ROLLBACK');
            return res.status(400).json({ message: 'Insufficient gem balance for the buy-in.' });
        }

        const { rows: [participantCount] } = await client.query("SELECT COUNT(*)::int as count FROM tournament_participants WHERE tournament_id = $1", [tournamentId]);
        if (participantCount.count >= tournament.capacity) {
            await client.query('ROLLBACK');
            return res.status(403).json({ message: 'This tournament is already full.' });
        }

        await client.query("UPDATE users SET gems = gems - $1 WHERE id = $2", [tournament.buy_in_amount, userId]);
        await client.query("INSERT INTO tournament_participants (tournament_id, user_id) VALUES ($1, $2)", [tournamentId, userId]);
        await client.query(
            "INSERT INTO transaction_history (user_id, type, amount_gems, description, reference_id) VALUES ($1, $2, $3, $4, $5)",
            [userId, 'tournament_buy_in', -Math.abs(tournament.buy_in_amount), `Buy-in for tournament: ${tournament.name}`, tournamentId]
        );

        await client.query('COMMIT');
        res.status(200).json({ message: 'Successfully registered for the tournament!' });

    } catch (err) {
        await client.query('ROLLBACK');
        if (err.code === '23505') { // Unique constraint violation
            return res.status(409).json({ message: 'You are already registered for this tournament.' });
        }
        console.error("Tournament Registration Error:", err);
        res.status(500).json({ message: 'An internal server error occurred during registration.' });
    } finally {
        client.release();
    }
});

module.exports = router;
