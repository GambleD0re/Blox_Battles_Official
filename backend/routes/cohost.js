// backend/routes/cohost.js
const express = require('express');
const { body, param } = require('express-validator');
const db = require('../database/database');
const { authenticateToken, handleValidationErrors } = require('../middleware/auth');
const crypto = require('crypto');

const router = express.Router();

// Middleware to authenticate co-host bot via session auth token
const authenticateCohostBot = async (req, res, next) => {
    const authToken = req.headers['x-cohost-token'];
    if (!authToken) {
        return res.status(401).json({ message: 'Unauthorized: Missing co-host token.' });
    }
    try {
        const { rows: [contract] } = await db.query(
            "SELECT id, claimed_by_user_id, status FROM host_contracts WHERE auth_token = $1",
            [authToken]
        );
        if (!contract || (contract.status !== 'active' && contract.status !== 'winding_down' && contract.status !== 'claimed')) {
            return res.status(403).json({ message: 'Forbidden: Invalid or inactive contract token.' });
        }
        req.contractData = contract;
        next();
    } catch (error) {
        console.error('Co-host bot authentication error:', error);
        res.status(500).json({ message: 'Internal server error during bot authentication.' });
    }
};


// GET: Fetch the user's current co-host status, active contract, and available contracts
router.get('/status', authenticateToken, async (req, res) => {
    const userId = req.user.userId;
    try {
        const { rows: [user] } = await db.query("SELECT terms_agreed_at FROM users WHERE id = $1", [userId]);
        const { rows: [activeContract] } = await db.query(
            "SELECT * FROM host_contracts WHERE claimed_by_user_id = $1 AND status IN ('claimed', 'active', 'winding_down')",
            [userId]
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

// POST: A user agrees to the terms
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

// POST: A user claims an available contract
router.post('/claim-contract', authenticateToken, [
    body('contractId').isUUID(),
    body('privateServerLink').isURL()
], handleValidationErrors, async (req, res) => {
    const userId = req.user.userId;
    const { contractId, privateServerLink } = req.body;
    const client = await db.getPool().connect();

    try {
        await client.query('BEGIN');

        const { rows: [user] } = await client.query("SELECT discord_id, terms_agreed_at FROM users WHERE id = $1", [userId]);
        if (!user.discord_id) {
            await client.query('ROLLBACK');
            return res.status(403).json({ message: "You must link your Discord account to co-host." });
        }
        if (!user.terms_agreed_at) {
            await client.query('ROLLBACK');
            return res.status(403).json({ message: "You must agree to the co-hosting terms first." });
        }

        const { rows: [contract] } = await client.query("SELECT id FROM host_contracts WHERE id = $1 AND status = 'available' FOR UPDATE", [contractId]);
        if (!contract) {
            await client.query('ROLLBACK');
            return res.status(404).json({ message: "This contract is no longer available." });
        }

        const authToken = crypto.randomBytes(32).toString('hex');
        const updateSql = `
            UPDATE host_contracts
            SET status = 'claimed', claimed_by_user_id = $1, private_server_link = $2, auth_token = $3, claimed_at = NOW()
            WHERE id = $4
        `;
        await client.query(updateSql, [userId, privateServerLink, authToken, contractId]);
        
        await client.query('COMMIT');
        res.status(200).json({ message: "Contract claimed! Please execute the provided script.", authToken });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error("Error claiming contract:", error);
        res.status(500).json({ message: "Failed to claim the contract." });
    } finally {
        client.release();
    }
});


// POST: Receives a heartbeat from an active co-host bot
router.post('/heartbeat', authenticateCohostBot, body('gems_collected_since_last').isInt({ min: 0 }), handleValidationErrors, async (req, res) => {
    const { id: contractId, claimed_by_user_id, status } = req.contractData;
    const { gems_collected_since_last } = req.body;
    
    try {
        const { rows: [cohostData] } = await db.query("SELECT total_uptime_seconds, reliability_tier FROM co_hosts WHERE user_id = $1", [claimed_by_user_id]);
        const tier = cohostData ? cohostData.reliability_tier : 3;

        let gemShare = 0;
        if (gems_collected_since_last > 0) {
            const tierRates = { 1: 0.50, 2: 1/3, 3: 0.25 };
            const rate = tierRates[tier] || 0.25;
            gemShare = Math.floor(gems_collected_since_last * rate);
        }

        const updateQuery = `
            UPDATE host_contracts 
            SET last_heartbeat = NOW(), gems_earned = gems_earned + $1, status = CASE WHEN status = 'claimed' THEN 'active' ELSE status END
            WHERE id = $2
        `;
        await db.query(updateQuery, [gemShare, contractId]);
        
        const command = status === 'winding_down' ? 'shutdown' : 'continue';
        res.status(200).json({ command });

    } catch (error) {
        console.error(`Heartbeat error for contract ${contractId}:`, error);
        res.status(500).json({ message: "Failed to process heartbeat." });
    }
});


// POST: User-initiated graceful shutdown
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

module.exports = router;
