// backend/routes/admin.js
const express = require('express');
const { body, param, query } = require('express-validator');
const db = require('../database/database');
const { authenticateToken, isAdmin, handleValidationErrors } = require('../middleware/auth');
const { getLogs } = require('../middleware/botLogger');

const router = express.Router();


// --- PLATFORM STATS ---
router.get('/stats', authenticateToken, isAdmin, async (req, res) => {
    try {
        const totalUsers = await db.get("SELECT COUNT(id) as count FROM users");
        const gemsInCirculation = await db.get("SELECT SUM(gems) as total FROM users");
        const pendingDisputes = await db.get("SELECT COUNT(id) as count FROM disputes WHERE status = 'pending'");
        const pendingPayouts = await db.get("SELECT COUNT(id) as count FROM payout_requests WHERE status = 'awaiting_approval'");
        const taxCollected = await db.get("SELECT SUM(tax_collected) as total FROM duels");

        res.status(200).json({
            totalUsers: totalUsers.count || 0,
            gemsInCirculation: gemsInCirculation.total || 0,
            pendingDisputes: pendingDisputes.count || 0,
            pendingPayouts: pendingPayouts.count || 0,
            taxCollected: taxCollected.total || 0,
        });
    } catch (err) {
        console.error("Admin fetch stats error:", err);
        res.status(500).json({ message: 'Failed to fetch platform statistics.' });
    }
});


// --- PAYOUT MANAGEMENT ---
router.get('/payout-requests', authenticateToken, isAdmin, async (req, res) => {
    try {
        const sql = `
            SELECT 
                pr.id, pr.user_id, pr.amount_gems, pr.type, pr.destination_address,
                pr.created_at, u.email, u.linked_roblox_username
            FROM payout_requests pr
            JOIN users u ON pr.user_id = u.id
            WHERE pr.status = 'awaiting_approval'
            ORDER BY pr.created_at ASC
        `;
        const requests = await db.all(sql);
        res.status(200).json(requests);
    } catch (err) {
        console.error("Admin fetch payout requests error:", err);
        res.status(500).json({ message: 'Failed to fetch payout requests.' });
    }
});

router.get('/users/:userId/details-for-payout/:payoutId', authenticateToken, isAdmin, async (req, res) => {
    const { userId, payoutId } = req.params;
    try {
        const userSql = `SELECT id, email, linked_roblox_username, wins, losses, gems, created_at FROM users WHERE id = ?`;
        const user = await db.get(userSql, [userId]);
        if (!user) return res.status(404).json({ message: 'User not found.' });

        const payoutSql = `SELECT amount_gems FROM payout_requests WHERE id = ? AND user_id = ?`;
        const payoutRequest = await db.get(payoutSql, [payoutId, userId]);
        if (!payoutRequest) return res.status(404).json({ message: 'Associated payout request not found.' });

        const duelHistorySql = `
            SELECT id, wager, winner_id, status, tax_collected
            FROM duels
            WHERE (challenger_id = ? OR opponent_id = ?) AND status IN ('completed', 'under_review', 'cheater_forfeit')
            ORDER BY created_at DESC
            LIMIT 50
        `;
        const duelHistory = await db.all(duelHistorySql, [userId, userId]);

        res.status(200).json({
            user: { ...user, balanceBeforeRequest: user.gems + payoutRequest.amount_gems, balanceAfterRequest: user.gems },
            duelHistory: duelHistory
        });
    } catch (err) {
        console.error("Admin fetch user details for payout error:", err);
        res.status(500).json({ message: 'Failed to fetch comprehensive user details.' });
    }
});


router.post('/payout-requests/:id/approve', authenticateToken, isAdmin, param('id').notEmpty(), handleValidationErrors, async (req, res) => {
    const requestId = req.params.id;
    try {
        await db.run('BEGIN TRANSACTION');
        const request = await db.get("SELECT * FROM payout_requests WHERE id = ? AND status = 'awaiting_approval'", [requestId]);
        if (!request) {
            await db.run('ROLLBACK');
            return res.status(404).json({ message: 'Request not found or not awaiting approval.' });
        }
        await db.run("UPDATE payout_requests SET status = 'approved', updated_at = CURRENT_TIMESTAMP WHERE id = ?", [requestId]);
        await db.run(
            `INSERT INTO inbox_messages (user_id, type, title, message, reference_id) VALUES (?, ?, ?, ?, ?)`,
            [request.user_id, 'withdrawal_update', 'Withdrawal Approved', `Your request to withdraw ${request.amount_gems} gems has been approved. Please go to your inbox to confirm the payout.`, request.id]
        );
        await db.run('COMMIT');
        res.status(200).json({ message: 'Withdrawal request approved.' });
    } catch (err) {
        await db.run('ROLLBACK').catch(console.error);
        console.error("Admin approve payout error:", err);
        res.status(500).json({ message: 'Failed to approve request.' });
    }
});

router.post('/payout-requests/:id/decline', authenticateToken, isAdmin, param('id').notEmpty(), body('reason').trim().notEmpty(), handleValidationErrors, async (req, res) => {
    const requestId = req.params.id;
    const { reason } = req.body;
    try {
        await db.run('BEGIN TRANSACTION');
        const request = await db.get("SELECT * FROM payout_requests WHERE id = ? AND status = 'awaiting_approval'", [requestId]);
        if (!request) {
            await db.run('ROLLBACK');
            return res.status(404).json({ message: 'Request not found or not awaiting approval.' });
        }
        await db.run('UPDATE users SET gems = gems + ? WHERE id = ?', [request.amount_gems, request.user_id]);
        await db.run("UPDATE payout_requests SET status = 'declined', decline_reason = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", [reason, requestId]);
        await db.run(
            `INSERT INTO inbox_messages (user_id, type, title, message, reference_id) VALUES (?, ?, ?, ?, ?)`,
            [request.user_id, 'withdrawal_update', 'Withdrawal Declined', `Your request to withdraw ${request.amount_gems} gems was declined. Reason: "${reason}"`, request.id]
        );
        await db.run('COMMIT');
        res.status(200).json({ message: 'Withdrawal request declined and gems refunded.' });
    } catch (err) {
        await db.run('ROLLBACK').catch(console.error);
        console.error("Admin decline payout error:", err);
        res.status(500).json({ message: 'Failed to decline request.' });
    }
});


// --- DISPUTE MANAGEMENT ---
router.get('/disputes', authenticateToken, isAdmin, async (req, res) => {
    try {
        const sql = `
            SELECT d.id, d.duel_id, d.reason, d.has_video_evidence, d.created_at, r.linked_roblox_username as reporter_username, rep.linked_roblox_username as reported_username
            FROM disputes d JOIN users r ON d.reporter_id = r.id JOIN users rep ON d.reported_id = rep.id
            WHERE d.status = 'pending' ORDER BY d.created_at ASC
        `;
        const disputes = await db.all(sql);
        res.status(200).json(disputes);
    } catch (err) {
        console.error("Admin fetch disputes error:", err);
        res.status(500).json({ message: 'Failed to fetch disputes.' });
    }
});

router.post('/disputes/:id/resolve', authenticateToken, isAdmin, param('id').isInt(), body('resolutionType').isIn(['uphold_winner', 'overturn_to_reporter', 'void_refund']), handleValidationErrors, async (req, res) => {
    const disputeId = req.params.id;
    const adminId = req.user.userId;
    const { resolutionType } = req.body;
    try {
        await db.run('BEGIN TRANSACTION');
        const dispute = await db.get('SELECT * FROM disputes WHERE id = ? AND status = "pending"', [disputeId]);
        if (!dispute) { await db.run('ROLLBACK'); return res.status(404).json({ message: 'Dispute not found or already resolved.' }); }
        const duel = await db.get('SELECT * FROM duels WHERE id = ?', [dispute.duel_id]);
        if (!duel) { await db.run('ROLLBACK'); return res.status(404).json({ message: 'Associated duel not found.' }); }
        let resolutionMessage = '';
        switch (resolutionType) {
            case 'uphold_winner':
                await db.run('UPDATE users SET gems = gems + ?, wins = wins + 1 WHERE id = ?', [duel.pot, duel.winner_id]);
                const loserId = duel.winner_id === duel.challenger_id ? duel.opponent_id : duel.challenger_id;
                await db.run('UPDATE users SET losses = losses + 1 WHERE id = ?', [loserId]);
                resolutionMessage = `Winner upheld. Pot of ${duel.pot} paid to original winner.`;
                break;
            case 'overturn_to_reporter':
                await db.run('UPDATE users SET gems = gems + ?, wins = wins + 1 WHERE id = ?', [duel.pot, dispute.reporter_id]);
                await db.run('UPDATE users SET losses = losses + 1 WHERE id = ?', [dispute.reported_id]);
                await db.run('UPDATE duels SET winner_id = ? WHERE id = ?', [dispute.reporter_id, duel.id]);
                resolutionMessage = `Result overturned. Pot of ${duel.pot} paid to reporter.`;
                break;
            case 'void_refund':
                const refundAmount = duel.pot / 2;
                await db.run('UPDATE users SET gems = gems + ? WHERE id = ?', [refundAmount, duel.challenger_id]);
                await db.run('UPDATE users SET gems = gems + ? WHERE id = ?', [refundAmount, duel.opponent_id]);
                resolutionMessage = `Duel voided. Pot of ${duel.pot} refunded to both players.`;
                break;
        }
        await db.run("UPDATE duels SET status = 'completed' WHERE id = ?", [duel.id]);
        await db.run("UPDATE disputes SET status = 'resolved', resolution = ?, resolved_at = CURRENT_TIMESTAMP, admin_resolver_id = ? WHERE id = ?", [resolutionMessage, adminId, disputeId]);
        await db.run('COMMIT');
        res.status(200).json({ message: 'Dispute resolved successfully.' });
    } catch (err) {
        await db.run('ROLLBACK').catch(console.error);
        console.error(`Admin Resolve Dispute Error:`, err);
        res.status(500).json({ message: 'An internal server error occurred.' });
    }
});


// --- SERVER LINK MANAGEMENT ---
router.get('/servers', authenticateToken, isAdmin, async (req, res) => {
    try {
        const servers = await db.all('SELECT * FROM region_servers ORDER BY region');
        res.status(200).json(servers);
    } catch (err) {
        console.error("Admin fetch servers error:", err);
        res.status(500).json({ message: 'Failed to fetch server links.' });
    }
});

router.post('/servers', authenticateToken, isAdmin, body('region').isIn(['Oceania', 'Europe', 'North America']), body('server_link').isURL(), handleValidationErrors, async (req, res) => {
    try {
        const { region, server_link } = req.body;
        await db.run('INSERT INTO region_servers (region, server_link) VALUES (?, ?)', [region, server_link]);
        res.status(201).json({ message: 'Server link added successfully.' });
    } catch (err) {
        if (err.code === 'SQLITE_CONSTRAINT') { return res.status(409).json({ message: 'That server link is already in the database.' }); }
        console.error("Admin add server error:", err);
        res.status(500).json({ message: 'Failed to add server link.' });
    }
});

router.delete('/servers/:id', authenticateToken, isAdmin, param('id').isInt(), handleValidationErrors, async (req, res) => {
    try {
        await db.run('DELETE FROM region_servers WHERE id = ?', [req.params.id]);
        res.status(200).json({ message: 'Server link deleted successfully.' });
    } catch (err) {
        console.error("Admin delete server error:", err);
        res.status(500).json({ message: 'Failed to delete server link.' });
    }
});


// --- USER MANAGEMENT ---
router.get('/users', authenticateToken, isAdmin, 
    query('search').optional().trim().escape(),
    query('status').optional().isIn(['active', 'banned', 'terminated']),
    async (req, res) => {
    try {
        const { search, status } = req.query;
        let sql = `SELECT id, email, linked_roblox_username, gems, wins, losses, is_admin, status, ban_applied_at, ban_expires_at, ban_reason FROM users`;
        const params = [];
        const conditions = [];
        if (search) {
            conditions.push(`(email LIKE ? OR linked_roblox_username LIKE ?)`);
            params.push(`%${search}%`, `%${search}%`);
        }
        if (status) {
            conditions.push(`status = ?`);
            params.push(status);
        }
        if (conditions.length > 0) { sql += ` WHERE ` + conditions.join(' AND '); }
        sql += ` ORDER BY created_at DESC`;
        const users = await db.all(sql, params);
        res.json(users);
    } catch (err) {
        console.error("Admin fetch users error:", err);
        res.status(500).json({ message: 'Failed to fetch users.' });
    }
});

router.post('/users/:id/gems', authenticateToken, isAdmin, param('id').isUUID(), body('amount').isInt(), handleValidationErrors, async (req, res) => {
    try {
        await db.run('UPDATE users SET gems = gems + ? WHERE id = ?', [req.body.amount, req.params.id]);
        res.status(200).json({ message: `Successfully updated gems for user ${req.params.id}.` });
    } catch (err) {
        console.error("Admin update gems error:", err);
        res.status(500).json({ message: 'Failed to update gems.' });
    }
});

// [MODIFIED] The validation for duration_hours is now more flexible.
router.post('/users/:id/ban', authenticateToken, isAdmin,
    param('id').isUUID(),
    body('reason').trim().notEmpty(),
    // Allow the field to be optional and an empty string, but if it exists and is not empty, it must be a positive integer.
    body('duration_hours').optional({ checkFalsy: true }).isInt({ gt: 0 }).withMessage('Duration must be a positive number of hours.'),
    handleValidationErrors,
    async (req, res) => {
        const { id } = req.params;
        const { reason, duration_hours } = req.body;
        try {
            await db.run('BEGIN TRANSACTION');
            let banExpiresAt = null;
            // Only set an expiry date if duration_hours is a valid number.
            if (duration_hours) {
                banExpiresAt = new Date();
                banExpiresAt.setHours(banExpiresAt.getHours() + parseInt(duration_hours, 10));
            }
            await db.run(`UPDATE users SET status = 'banned', ban_reason = ?, ban_expires_at = ?, ban_applied_at = CURRENT_TIMESTAMP WHERE id = ?`, [reason, banExpiresAt, id]);
            const pendingWithdrawals = await db.all("SELECT * FROM payout_requests WHERE user_id = ? AND status = 'awaiting_approval'", [id]);
            for (const request of pendingWithdrawals) {
                await db.run("UPDATE payout_requests SET status = 'canceled_by_user' WHERE id = ?", [request.id]);
            }
            const pendingDuels = await db.all("SELECT * FROM duels WHERE (challenger_id = ? OR opponent_id = ?) AND status IN ('pending', 'accepted')", [id, id]);
            for (const duel of pendingDuels) {
                if (duel.status === 'accepted') {
                    const opponentId = duel.challenger_id === id ? duel.opponent_id : duel.challenger_id;
                    await db.run('UPDATE users SET gems = gems + ? WHERE id = ?', [duel.wager, opponentId]);
                }
                await db.run("UPDATE duels SET status = 'canceled' WHERE id = ?", [duel.id]);
            }
            await db.run('COMMIT');
            res.status(200).json({ message: `User ${id} has been banned and their pending actions canceled.` });
        } catch (err) {
            await db.run('ROLLBACK').catch(console.error);
            console.error("Admin ban user error:", err);
            res.status(500).json({ message: 'Failed to ban user.' });
        }
    }
);

router.delete('/users/:id/ban', authenticateToken, isAdmin, param('id').isUUID(), handleValidationErrors, async (req, res) => {
    try {
        await db.run(`UPDATE users SET status = 'active', ban_reason = NULL, ban_expires_at = NULL, ban_applied_at = NULL WHERE id = ?`, [req.params.id]);
        res.status(200).json({ message: `User ${req.params.id} has been unbanned.` });
    } catch (err) {
        console.error("Admin unban user error:", err);
        res.status(500).json({ message: 'Failed to unban user.' });
    }
});

router.delete('/users/:id', authenticateToken, isAdmin, param('id').isUUID(), handleValidationErrors, async (req, res) => {
    try {
        await db.run("UPDATE users SET status = 'terminated', gems = 0 WHERE id = ?", [req.params.id]);
        res.status(200).json({ message: `User ${req.params.id} has been terminated.` });
    } catch (err) {
        console.error("Admin terminate user error:", err);
        res.status(500).json({ message: 'Failed to terminate user.' });
    }
});


// --- OTHER ADMIN ROUTES ---
router.get('/logs', authenticateToken, isAdmin, (req, res) => {
    res.json(getLogs());
});
router.post('/tasks', authenticateToken, isAdmin, body('task_type').notEmpty(), body('payload').isJSON(), handleValidationErrors, async (req, res) => {
    try {
        await db.run('INSERT INTO tasks (task_type, payload) VALUES (?, ?)', [req.body.task_type, req.body.payload]);
        res.status(201).json({ message: 'Task created successfully.' });
    } catch (err) {
        console.error("Admin create task error:", err);
        res.status(500).json({ message: 'Failed to create task.' });
    }
});

module.exports = router;