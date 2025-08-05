// backend/routes/admin.js
const express = require('express');
const { body, param, query } = require('express-validator');
const db = require('../database/database');
const { authenticateToken, isAdmin, isMasterAdmin, handleValidationErrors } = require('../middleware/auth');
const { getLogs } = require('../middleware/botLogger');
const crypto = require('crypto');
const GAME_DATA = require('../game-data-store');

const router = express.Router();

const decrementPlayerCount = async (client, duelId) => {
    try {
        const { rows: [duel] } = await client.query('SELECT assigned_server_id FROM duels WHERE id = $1', [duelId]);
        if (duel && duel.assigned_server_id) {
            await client.query('UPDATE game_servers SET player_count = GREATEST(0, player_count - 2) WHERE server_id = $1', [duel.assigned_server_id]);
            console.log(`[PlayerCount] Decremented player count for server ${duel.assigned_server_id} from duel ${duelId} via admin action.`);
        }
    } catch (err) {
        console.error(`[PlayerCount] Failed to decrement player count for duel ${duelId}:`, err);
    }
};

// --- SYSTEM STATUS MANAGEMENT (MASTER ADMIN ONLY) ---
router.get('/system-status', authenticateToken, isMasterAdmin, async (req, res) => {
    try {
        const { rows } = await db.query('SELECT feature_name, is_enabled, disabled_message FROM system_status ORDER BY feature_name');
        res.status(200).json(rows);
    } catch (err) {
        console.error("Admin Get System Status Error:", err);
        res.status(500).json({ message: 'Failed to fetch system status.' });
    }
});

router.put('/system-status', authenticateToken, isMasterAdmin, [
    body('feature_name').isString().notEmpty(),
    body('is_enabled').isBoolean(),
    body('disabled_message').isString().optional({ nullable: true })
], handleValidationErrors, async (req, res) => {
    const { feature_name, is_enabled, disabled_message } = req.body;
    try {
        const sql = `
            UPDATE system_status 
            SET is_enabled = $1, disabled_message = $2 
            WHERE feature_name = $3
        `;
        await db.query(sql, [is_enabled, disabled_message, feature_name]);
        res.status(200).json({ message: `Status for '${feature_name}' updated successfully.` });
    } catch (err) {
        console.error("Admin Update System Status Error:", err);
        res.status(500).json({ message: 'Failed to update system status.' });
    }
});

// --- HOST CONTRACT MANAGEMENT (ADMINS ONLY) ---
const validRegions = GAME_DATA.regions.map(r => r.id);
router.post('/host-contracts', authenticateToken, isAdmin, [
    body('region').isIn(validRegions)
], handleValidationErrors, async (req, res) => {
    const { region } = req.body;
    const adminId = req.user.userId;
    try {
        const contractId = crypto.randomUUID();
        await db.query(
            "INSERT INTO host_contracts (id, region, issued_by_admin_id) VALUES ($1, $2, $3)",
            [contractId, region, adminId]
        );
        res.status(201).json({ message: `Host contract for ${region} has been successfully issued.` });
    } catch (error) {
        console.error("Error issuing host contract:", error);
        res.status(500).json({ message: "Failed to issue host contract." });
    }
});

router.get('/host-contracts', authenticateToken, isAdmin, async (req, res) => {
    try {
        const sql = `
            SELECT 
                hc.*, 
                u.linked_roblox_username as co_host_username,
                admin.linked_roblox_username as admin_username
            FROM host_contracts hc
            LEFT JOIN users u ON hc.claimed_by_user_id = u.id
            LEFT JOIN users admin ON hc.issued_by_admin_id = admin.id
            ORDER BY hc.issued_at DESC
        `;
        const { rows } = await db.query(sql);
        res.status(200).json(rows);
    } catch (error) {
        console.error("Error fetching host contracts:", error);
        res.status(500).json({ message: "Failed to fetch host contracts." });
    }
});


// --- TOURNAMENT MANAGEMENT ---
router.post('/tournaments', authenticateToken, isAdmin, [
    body('name').trim().notEmpty(),
    body('region').trim().notEmpty(),
    body('assigned_bot_id').trim().notEmpty(),
    body('private_server_link').isURL(),
    body('buy_in_amount').isInt({ gt: -1 }),
    body('prize_pool_gems').isInt({ gt: 0 }),
    body('registration_opens_at').isISO8601(),
    body('starts_at').isISO8601(),
    body('rules').isObject(),
    body('prize_distribution').isObject(),
], handleValidationErrors, async (req, res) => {
    const { name, region, assigned_bot_id, private_server_link, buy_in_amount, prize_pool_gems, registration_opens_at, starts_at, rules, prize_distribution } = req.body;
    try {
        const tournamentId = crypto.randomUUID();
        const sql = `
            INSERT INTO tournaments (id, name, region, assigned_bot_id, private_server_link, buy_in_amount, prize_pool_gems, registration_opens_at, starts_at, rules, prize_distribution)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        `;
        await db.query(sql, [tournamentId, name, region, assigned_bot_id, private_server_link, buy_in_amount, prize_pool_gems, registration_opens_at, starts_at, JSON.stringify(rules), JSON.stringify(prize_distribution)]);
        res.status(201).json({ message: 'Tournament created successfully.', tournamentId });
    } catch (err) {
        console.error("Admin Create Tournament Error:", err);
        res.status(500).json({ message: 'Failed to create tournament.' });
    }
});

router.get('/tournaments', authenticateToken, isAdmin, async (req, res) => {
    try {
        const { rows } = await db.query("SELECT id, name, status, starts_at FROM tournaments ORDER BY created_at DESC");
        res.status(200).json(rows);
    } catch (err) {
        console.error("Admin Fetch Tournaments Error:", err);
        res.status(500).json({ message: 'Failed to fetch tournaments.' });
    }
});

router.delete('/tournaments/:id', authenticateToken, isAdmin, param('id').isUUID(), handleValidationErrors, async (req, res) => {
    const tournamentId = req.params.id;
    const client = await db.getPool().connect();
    try {
        await client.query('BEGIN');
        const { rows: [tournament] } = await client.query("SELECT * FROM tournaments WHERE id = $1 AND status IN ('scheduled', 'registration_open') FOR UPDATE", [tournamentId]);
        if (!tournament) {
            await client.query('ROLLBACK');
            return res.status(404).json({ message: 'Tournament not found or has already started.' });
        }
        
        const { rows: participants } = await client.query("SELECT user_id FROM tournament_participants WHERE tournament_id = $1", [tournamentId]);
        for (const participant of participants) {
            await client.query("UPDATE users SET gems = gems + $1 WHERE id = $2", [tournament.buy_in_amount, participant.user_id]);
            await client.query(
                "INSERT INTO transaction_history (user_id, type, amount_gems, description, reference_id) VALUES ($1, $2, $3, $4, $5)",
                [participant.user_id, 'tournament_buy_in', tournament.buy_in_amount, `Refund for canceled tournament: ${tournament.name}`, tournamentId]
            );
        }
        
        await client.query("UPDATE tournaments SET status = 'canceled' WHERE id = $1", [tournamentId]);
        
        await client.query('COMMIT');
        res.status(200).json({ message: 'Tournament canceled and all players refunded.' });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error("Admin Cancel Tournament Error:", err);
        res.status(500).json({ message: 'Failed to cancel tournament.' });
    } finally {
        client.release();
    }
});


// --- PLATFORM STATS ---
router.get('/stats', authenticateToken, isAdmin, async (req, res) => {
    try {
        const { rows: [totalUsers] } = await db.query("SELECT COUNT(id)::int as count FROM users");
        const { rows: [gemsInCirculation] } = await db.query("SELECT SUM(gems)::bigint as total FROM users");
        const { rows: [pendingDisputes] } = await db.query("SELECT COUNT(id)::int as count FROM disputes WHERE status = 'pending'");
        const { rows: [pendingPayouts] } = await db.query("SELECT COUNT(id)::int as count FROM payout_requests WHERE status = 'awaiting_approval'");
        const { rows: [taxCollected] } = await db.query("SELECT SUM(tax_collected)::bigint as total FROM duels");

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
        const { rows: requests } = await db.query(sql);
        res.status(200).json(requests);
    } catch (err) {
        console.error("Admin fetch payout requests error:", err);
        res.status(500).json({ message: 'Failed to fetch payout requests.' });
    }
});

router.get('/users/:userId/details-for-payout/:payoutId', authenticateToken, isAdmin, async (req, res) => {
    const { userId, payoutId } = req.params;
    try {
        const userSql = `SELECT id, email, linked_roblox_username, wins, losses, gems, created_at FROM users WHERE id = $1`;
        const { rows: [user] } = await db.query(userSql, [userId]);
        if (!user) return res.status(404).json({ message: 'User not found.' });

        const payoutSql = `SELECT amount_gems FROM payout_requests WHERE id = $1 AND user_id = $2`;
        const { rows: [payoutRequest] } = await db.query(payoutSql, [payoutId, userId]);
        if (!payoutRequest) return res.status(404).json({ message: 'Associated payout request not found.' });

        const duelHistorySql = `
            SELECT id, wager, winner_id, status, tax_collected
            FROM duels
            WHERE (challenger_id = $1 OR opponent_id = $1) AND status IN ('completed', 'under_review', 'cheater_forfeit')
            ORDER BY created_at DESC
            LIMIT 50
        `;
        const { rows: duelHistory } = await db.query(duelHistorySql, [userId]);

        res.status(200).json({
            user: { ...user, balanceBeforeRequest: parseInt(user.gems) + parseInt(payoutRequest.amount_gems), balanceAfterRequest: user.gems },
            duelHistory: duelHistory
        });
    } catch (err) {
        console.error("Admin fetch user details for payout error:", err);
        res.status(500).json({ message: 'Failed to fetch comprehensive user details.' });
    }
});


router.post('/payout-requests/:id/approve', authenticateToken, isAdmin, param('id').isUUID(), handleValidationErrors, async (req, res) => {
    const requestId = req.params.id;
    const client = await db.getPool().connect();
    try {
        await client.query('BEGIN');
        const { rows: [request] } = await client.query("SELECT * FROM payout_requests WHERE id = $1 AND status = 'awaiting_approval' FOR UPDATE", [requestId]);
        if (!request) {
            await client.query('ROLLBACK');
            return res.status(404).json({ message: 'Request not found or not awaiting approval.' });
        }
        await client.query("UPDATE payout_requests SET status = 'approved', updated_at = NOW() WHERE id = $1", [requestId]);
        await client.query(
            `INSERT INTO inbox_messages (user_id, type, title, message, reference_id) VALUES ($1, 'withdrawal_update', 'Withdrawal Approved', 'Your request to withdraw ' || $2 || ' gems has been approved. Please go to your inbox to confirm the payout.', $3)`,
            [request.user_id, request.amount_gems, request.id]
        );
        await client.query('COMMIT');
        res.status(200).json({ message: 'Withdrawal request approved.' });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error("Admin approve payout error:", err);
        res.status(500).json({ message: 'Failed to approve request.' });
    } finally {
        client.release();
    }
});

router.post('/payout-requests/:id/decline', authenticateToken, isAdmin, param('id').isUUID(), body('reason').trim().notEmpty(), handleValidationErrors, async (req, res) => {
    const requestId = req.params.id;
    const { reason } = req.body;
    const client = await db.getPool().connect();
    try {
        await client.query('BEGIN');
        const { rows: [request] } = await client.query("SELECT * FROM payout_requests WHERE id = $1 AND status = 'awaiting_approval' FOR UPDATE", [requestId]);
        if (!request) {
            await client.query('ROLLBACK');
            return res.status(404).json({ message: 'Request not found or not awaiting approval.' });
        }
        await client.query('UPDATE users SET gems = gems + $1 WHERE id = $2', [request.amount_gems, request.user_id]);
        await client.query("UPDATE payout_requests SET status = 'declined', decline_reason = $1, updated_at = NOW() WHERE id = $2", [reason, requestId]);
        await client.query(
            `INSERT INTO inbox_messages (user_id, type, title, message, reference_id) VALUES ($1, 'withdrawal_update', 'Withdrawal Declined', 'Your request to withdraw ' || $2 || ' gems was declined. Reason: "' || $3 || '"', $4)`,
            [request.user_id, request.amount_gems, reason, request.id]
        );
        await client.query('COMMIT');
        res.status(200).json({ message: 'Withdrawal request declined and gems refunded.' });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error("Admin decline payout error:", err);
        res.status(500).json({ message: 'Failed to decline request.' });
    } finally {
        client.release();
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
        const { rows: disputes } = await db.query(sql);
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
    const client = await db.getPool().connect();
    try {
        await client.query('BEGIN');
        const { rows: [dispute] } = await client.query("SELECT * FROM disputes WHERE id = $1 AND status = 'pending' FOR UPDATE", [disputeId]);
        if (!dispute) { await client.query('ROLLBACK'); return res.status(404).json({ message: 'Dispute not found or already resolved.' }); }
        
        const { rows: [duel] } = await client.query('SELECT * FROM duels WHERE id = $1 FOR UPDATE', [dispute.duel_id]);
        if (!duel) { await client.query('ROLLBACK'); return res.status(404).json({ message: 'Associated duel not found.' }); }

        let resolutionMessage = '';
        switch (resolutionType) {
            case 'uphold_winner':
                await client.query('UPDATE users SET gems = gems + $1, wins = wins + 1 WHERE id = $2', [duel.pot, duel.winner_id]);
                const loserId = duel.winner_id.toString() === duel.challenger_id.toString() ? duel.opponent_id : duel.challenger_id;
                await client.query('UPDATE users SET losses = losses + 1 WHERE id = $1', [loserId]);
                resolutionMessage = `Winner upheld. Pot of ${duel.pot} paid to original winner.`;
                break;
            case 'overturn_to_reporter':
                await client.query('UPDATE users SET gems = gems + $1, wins = wins + 1 WHERE id = $2', [duel.pot, dispute.reporter_id]);
                await client.query('UPDATE users SET losses = losses + 1 WHERE id = $1', [dispute.reported_id]);
                await client.query('UPDATE duels SET winner_id = $1 WHERE id = $2', [dispute.reporter_id, duel.id]);
                resolutionMessage = `Result overturned. Pot of ${duel.pot} paid to reporter.`;
                break;
            case 'void_refund':
                const refundAmount = duel.wager;
                await client.query('UPDATE users SET gems = gems + $1 WHERE id = $2', [refundAmount, duel.challenger_id]);
                await client.query('UPDATE users SET gems = gems + $1 WHERE id = $2', [refundAmount, duel.opponent_id]);
                await client.query('UPDATE duels SET tax_collected = 0 WHERE id = $1', [duel.id]);
                resolutionMessage = `Duel voided. Pot of ${duel.wager * 2} refunded to both players.`;
                break;
        }
        await client.query("UPDATE duels SET status = 'completed' WHERE id = $1", [duel.id]);
        await client.query("UPDATE disputes SET status = 'resolved', resolution = $1, resolved_at = NOW(), admin_resolver_id = $2 WHERE id = $3", [resolutionMessage, adminId, disputeId]);
        
        await decrementPlayerCount(client, duel.id);

        await client.query('COMMIT');
        res.status(200).json({ message: 'Dispute resolved successfully.' });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error(`Admin Resolve Dispute Error:`, err);
        res.status(500).json({ message: 'An internal server error occurred.' });
    } finally {
        client.release();
    }
});


// --- SERVER MANAGEMENT IS NOW READ-ONLY ---
router.get('/servers', authenticateToken, isAdmin, async (req, res) => {
    try {
        const { rows: servers } = await db.query('SELECT server_id, region, join_link, player_count, last_heartbeat FROM game_servers ORDER BY region, server_id');
        res.status(200).json(servers);
    } catch (err) {
        console.error("Admin fetch servers error:", err);
        res.status(500).json({ message: 'Failed to fetch game servers.' });
    }
});


// --- USER MANAGEMENT ---
router.get('/users', authenticateToken, isAdmin, 
    query('search').optional().trim(),
    query('status').optional().isIn(['active', 'banned', 'terminated']),
    async (req, res) => {
    try {
        const { search, status } = req.query;
        let sql = `SELECT id, email, linked_roblox_username, gems, wins, losses, is_admin, status, ban_applied_at, ban_expires_at, ban_reason FROM users`;
        const params = [];
        const conditions = [];
        let paramIndex = 1;

        if (search) {
            conditions.push(`(email ILIKE $${paramIndex} OR linked_roblox_username ILIKE $${paramIndex})`);
            params.push(`%${search}%`);
            paramIndex++;
        }
        if (status) {
            conditions.push(`status = $${paramIndex}`);
            params.push(status);
            paramIndex++;
        }

        if (conditions.length > 0) {
            sql += ` WHERE ` + conditions.join(' AND ');
        }
        sql += ` ORDER BY created_at DESC`;
        
        const { rows: users } = await db.query(sql, params);
        res.json(users);
    } catch (err) {
        console.error("Admin fetch users error:", err);
        res.status(500).json({ message: 'Failed to fetch users.' });
    }
});

router.post('/users/:id/gems', authenticateToken, isAdmin, param('id').isUUID(), body('amount').isInt(), handleValidationErrors, async (req, res) => {
    try {
        await db.query('UPDATE users SET gems = gems + $1 WHERE id = $2', [req.body.amount, req.params.id]);
        res.status(200).json({ message: `Successfully updated gems for user ${req.params.id}.` });
    } catch (err) {
        console.error("Admin update gems error:", err);
        res.status(500).json({ message: 'Failed to update gems.' });
    }
});

router.post('/users/:id/ban', authenticateToken, isAdmin,
    param('id').isUUID(),
    body('reason').trim().notEmpty(),
    body('duration_hours').optional({ checkFalsy: true }).isInt({ gt: 0 }).withMessage('Duration must be a positive number of hours.'),
    handleValidationErrors,
    async (req, res) => {
        const { id } = req.params;
        const { reason, duration_hours } = req.body;
        const client = await db.getPool().connect();
        try {
            await client.query('BEGIN');
            
            const banExpiresAtClause = duration_hours ? `NOW() + INTERVAL '${parseInt(duration_hours, 10)} hours'` : 'NULL';
            const banSql = `UPDATE users SET status = 'banned', ban_reason = $1, ban_expires_at = ${banExpiresAtClause}, ban_applied_at = NOW() WHERE id = $2`;
            await client.query(banSql, [reason, id]);

            await client.query("UPDATE payout_requests SET status = 'canceled_by_user' WHERE user_id = $1 AND status = 'awaiting_approval'", [id]);
            
            const { rows: pendingDuels } = await client.query("SELECT * FROM duels WHERE (challenger_id = $1 OR opponent_id = $1) AND status IN ('pending', 'accepted') FOR UPDATE", [id]);
            
            for (const duel of pendingDuels) {
                if (duel.status === 'accepted') {
                    const opponentId = duel.challenger_id.toString() === id ? duel.opponent_id : duel.challenger_id;
                    await client.query('UPDATE users SET gems = gems + $1 WHERE id = $2', [duel.wager, opponentId]);
                }
                if(duel.status === 'started' || duel.status === 'accepted'){
                    await decrementPlayerCount(client, duel.id);
                }
                await client.query("UPDATE duels SET status = 'canceled' WHERE id = $1", [duel.id]);
            }
            
            await client.query('COMMIT');
            res.status(200).json({ message: `User ${id} has been banned and their pending actions canceled.` });
        } catch (err) {
            await client.query('ROLLBACK');
            console.error("Admin ban user error:", err);
            res.status(500).json({ message: 'Failed to ban user.' });
        } finally {
            client.release();
        }
    }
);

router.delete('/users/:id/ban', authenticateToken, isAdmin, param('id').isUUID(), handleValidationErrors, async (req, res) => {
    try {
        await db.query(`UPDATE users SET status = 'active', ban_reason = NULL, ban_expires_at = NULL, ban_applied_at = NULL WHERE id = $1`, [req.params.id]);
        res.status(200).json({ message: `User ${req.params.id} has been unbanned.` });
    } catch (err) {
        console.error("Admin unban user error:", err);
        res.status(500).json({ message: 'Failed to unban user.' });
    }
});

router.delete('/users/:id', authenticateToken, isAdmin, param('id').isUUID(), handleValidationErrors, async (req, res) => {
    try {
        await db.query("UPDATE users SET status = 'terminated', gems = 0 WHERE id = $1", [req.params.id]);
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
        await db.query('INSERT INTO tasks (task_type, payload) VALUES ($1, $2)', [req.body.task_type, req.body.payload]);
        res.status(201).json({ message: 'Task created successfully.' });
    } catch (err) {
        console.error("Admin create task error:", err);
        res.status(500).json({ message: 'Failed to create task.' });
    }
});

module.exports = router;
