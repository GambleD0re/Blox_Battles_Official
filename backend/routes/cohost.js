// backend/routes/cohost.js
const express = require('express');
const { body } = require('express-validator');
const db = require('../database/database');
const { authenticateToken, handleValidationErrors } = require('../middleware/auth');
const crypto = require('crypto');

const router = express.Router();

// Middleware to authenticate co-host bot via EITHER a temp or permanent token
const authenticateCohostBot = async (req, res, next) => {
    const authToken = req.headers['x-cohost-token'];
    if (!authToken) {
        return res.status(401).json({ message: 'Unauthorized: Missing co-host token.' });
    }
    try {
        // First, check if it's a permanent token for an active contract
        let { rows: [contract] } = await db.query(
            "SELECT id, claimed_by_user_id, status FROM host_contracts WHERE auth_token = $1", [authToken]
        );
        if (contract) {
            if (contract.status !== 'active' && contract.status !== 'winding_down') {
                return res.status(403).json({ message: 'Forbidden: Contract is not active.', action: 'terminate' });
            }
            req.tokenType = 'permanent';
            req.contractData = contract;
            return next();
        }

        // If not, check if it's a temporary token from a pending bid
        let { rows: [bid] } = await db.query(
            "SELECT id, contract_id, user_id, status, private_server_link FROM host_contract_bids WHERE temp_auth_token = $1", [authToken]
        );
        if (bid) {
            if (bid.status !== 'pending') {
                return res.status(403).json({ message: 'Forbidden: This bid has expired.', action: 'terminate' });
            }
            req.tokenType = 'temporary';
            req.bidData = bid;
            return next();
        }
        
        return res.status(403).json({ message: 'Forbidden: Invalid token.', action: 'terminate' });

    } catch (error) {
        console.error('Co-host bot authentication error:', error);
        res.status(500).json({ message: 'Internal server error during bot authentication.' });
    }
};

router.get('/status', authenticateToken, async (req, res) => {
    const userId = req.user.userId;
    try {
        const { rows: [user] } = await db.query("SELECT terms_agreed_at FROM users WHERE id = $1", [userId]);
        const { rows: [activeContract] } = await db.query(
            "SELECT * FROM host_contracts WHERE claimed_by_user_id = $1 AND status IN ('active', 'winding_down')", [userId]
        );
        const { rows: availableContracts } = await db.query(
            "SELECT id, region, issued_at FROM host_contracts WHERE status = 'available' ORDER BY issued_at DESC"
        );
        
        res.status(200).json({
            termsAgreed: !!user.terms_agreed_at,
            activeContract: activeContract || null,
            availableContracts: availableContracts || []
        });
    } catch (error) {
        console.error("Error fetching co-host status:", error);
        res.status(500).json({ message: "Failed to fetch co-host status." });
    }
});

router.post('/agree-terms', authenticateToken, async (req, res) => {
    const userId = req.user.userId;
    try {
        await db.query("UPDATE users SET terms_agreed_at = NOW() WHERE id = $1", [userId]);
        res.status(200).json({ message: "Terms and conditions agreed." });
    } catch (error) {
        console.error("Error agreeing to co-host terms:", error);
        res.status(500).json({ message: "Failed to agree to terms." });
    }
});

router.post('/request-script', authenticateToken, [
    body('contractId').isUUID(),
    body('privateServerLink').isURL()
], handleValidationErrors, async (req, res) => {
    const userId = req.user.userId;
    const { contractId, privateServerLink } = req.body;
    
    try {
        const { rows: [user] } = await db.query("SELECT discord_id, terms_agreed_at FROM users WHERE id = $1", [userId]);
        if (!user.discord_id || !user.terms_agreed_at) {
            return res.status(403).json({ message: "You must link Discord and agree to the terms first." });
        }
        const { rows: [contract] } = await db.query("SELECT status FROM host_contracts WHERE id = $1", [contractId]);
        if (!contract || contract.status !== 'available') {
            return res.status(404).json({ message: "This contract is no longer available." });
        }

        const tempAuthToken = crypto.randomBytes(32).toString('hex');
        await db.query(
            "INSERT INTO host_contract_bids (contract_id, user_id, temp_auth_token, private_server_link) VALUES ($1, $2, $3, $4) ON CONFLICT (contract_id, user_id) DO UPDATE SET temp_auth_token = $3, private_server_link = $4",
            [contractId, userId, tempAuthToken, privateServerLink]
        );
        
        res.status(200).json({ message: "Script request successful. The first bot to connect wins the contract.", tempAuthToken });

    } catch (error) {
        console.error("Error requesting script:", error);
        res.status(500).json({ message: "Failed to request script." });
    }
});

router.post('/heartbeat', authenticateCohostBot, body('gems_collected_since_last').isInt({ min: 0 }), handleValidationErrors, async (req, res) => {
    const { gems_collected_since_last } = req.body;
    const client = await db.getPool().connect();
    
    try {
        if (req.tokenType === 'temporary') {
            await client.query('BEGIN');
            const { contract_id, user_id, private_server_link } = req.bidData;

            const { rows: [contract] } = await client.query("SELECT status FROM host_contracts WHERE id = $1 FOR UPDATE", [contract_id]);
            if (contract.status !== 'available') {
                await client.query("UPDATE host_contract_bids SET status = 'lost' WHERE id = $1", [req.bidData.id]);
                await client.query('COMMIT');
                return res.status(409).json({ message: "Contract was claimed by another host.", action: 'terminate' });
            }

            const permanentAuthToken = crypto.randomBytes(32).toString('hex');
            await client.query(
                "UPDATE host_contracts SET status = 'active', claimed_by_user_id = $1, private_server_link = $2, auth_token = $3, claimed_at = NOW(), start_time = NOW(), last_heartbeat = NOW() WHERE id = $4",
                [user_id, private_server_link, permanentAuthToken, contract_id]
            );
            await client.query("UPDATE host_contract_bids SET status = 'won' WHERE id = $1", [req.bidData.id]);
            await client.query("UPDATE host_contract_bids SET status = 'lost' WHERE contract_id = $1 AND status = 'pending'", [contract_id]);
            
            await client.query('COMMIT');
            return res.status(200).json({ command: 'continue', newAuthToken: permanentAuthToken });
        }
        
        if (req.tokenType === 'permanent') {
            const { id: contractId, claimed_by_user_id, status } = req.contractData;
            
            const { rows: [cohostData] } = await client.query("SELECT total_uptime_seconds, reliability_tier FROM co_hosts WHERE user_id = $1", [claimed_by_user_id]);
            const tier = cohostData ? cohostData.reliability_tier : 3;
            let gemShare = 0;
            if (gems_collected_since_last > 0) {
                const tierRates = { 1: 0.50, 2: 1/3, 3: 0.25 };
                const rate = tierRates[tier] || 0.25;
                gemShare = Math.floor(gems_collected_since_last * rate);
            }

            await client.query("UPDATE host_contracts SET last_heartbeat = NOW(), gems_earned = gems_earned + $1 WHERE id = $2", [gemShare, contractId]);
            const command = status === 'winding_down' ? 'shutdown' : 'continue';
            return res.status(200).json({ command });
        }
    } catch (error) {
        await client.query('ROLLBACK');
        console.error(`Heartbeat processing error:`, error);
        res.status(500).json({ message: "Failed to process heartbeat." });
    } finally {
        client.release();
    }
});

router.post('/shutdown', authenticateToken, async (req, res) => {
    const userId = req.user.userId;
    try {
        const { rowCount } = await db.query(
            "UPDATE host_contracts SET status = 'winding_down' WHERE claimed_by_user_id = $1 AND status = 'active'",
            [userId]
        );

        if (rowCount === 0) {
            return res.status(404).json({ message: "No active session found to shut down." });
        }
        res.status(200).json({ message: "Shutdown initiated. Your bot will close automatically when it's safe to do so." });
    } catch (error) {
        console.error(`Error initiating shutdown for user ${userId}:`, error);
        res.status(500).json({ message: "Failed to initiate shutdown." });
    }
});

router.get('/tasks', authenticateCohostBot, async (req, res) => {
    const contractId = req.contractData.id;
    const client = await db.getPool().connect();
    try {
        await client.query('BEGIN');
        const sql = `
            SELECT id, task_type, payload 
            FROM tasks 
            WHERE status = 'pending' 
              AND task_type = 'REFEREE_DUEL' 
              AND payload->>'serverId' = $1
            FOR UPDATE SKIP LOCKED
            LIMIT 10
        `;
        const { rows: tasksForBot } = await client.query(sql, [contractId]);

        if (tasksForBot.length > 0) {
            const idsToUpdate = tasksForBot.map(t => t.id);
            await client.query(`UPDATE tasks SET status = 'processing' WHERE id = ANY($1::int[])`, [idsToUpdate]);
        }

        await client.query('COMMIT');
        res.json(tasksForBot);
    } catch (err) {
        await client.query('ROLLBACK');
        console.error(`Co-host Task Fetch Error for contract ${contractId}:`, err);
        res.status(500).json({ message: 'Failed to fetch tasks.' });
    } finally {
        client.release();
    }
});

module.exports = router;
