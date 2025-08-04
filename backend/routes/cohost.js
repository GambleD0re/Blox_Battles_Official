// backend/routes/cohost.js
const express = require('express');
const { body } = require('express-validator');
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
        const { rows: [session] } = await db.query(
            "SELECT id, co_host_user_id, status FROM hosting_sessions WHERE auth_token = $1",
            [authToken]
        );
        if (!session || (session.status !== 'active' && session.status !== 'winding_down')) {
            return res.status(403).json({ message: 'Forbidden: Invalid or inactive session token.' });
        }
        req.sessionData = session;
        next();
    } catch (error) {
        console.error('Co-host bot authentication error:', error);
        res.status(500).json({ message: 'Internal server error during bot authentication.' });
    }
};


// GET: Fetch the user's current co-host status and active session
router.get('/status', authenticateToken, async (req, res) => {
    const userId = req.user.userId;
    try {
        const { rows: [cohost] } = await db.query("SELECT * FROM co_hosts WHERE user_id = $1", [userId]);
        const { rows: [activeSession] } = await db.query(
            "SELECT id, start_time, status, gems_earned FROM hosting_sessions WHERE co_host_user_id = $1 AND status IN ('initializing', 'active', 'winding_down')",
            [userId]
        );
        
        res.status(200).json({
            cohostData: cohost,
            activeSession: activeSession || null
        });
    } catch (error) {
        console.error("Error fetching co-host status:", error);
        res.status(500).json({ message: "Failed to fetch co-host status." });
    }
});

// POST: Start a new hosting session
router.post('/start-session', authenticateToken, async (req, res) => {
    const userId = req.user.userId;
    const client = await db.getPool().connect();
    try {
        await client.query('BEGIN');

        const { rows: [user] } = await client.query("SELECT discord_id FROM users WHERE id = $1", [userId]);
        if (!user.discord_id) {
            await client.query('ROLLBACK');
            return res.status(403).json({ message: "You must link your Discord account to become a co-host." });
        }
        
        const { rows: [existingSession] } = await client.query(
            "SELECT id FROM hosting_sessions WHERE co_host_user_id = $1 AND status IN ('initializing', 'active', 'winding_down')",
            [userId]
        );
        if (existingSession) {
            await client.query('ROLLBACK');
            return res.status(409).json({ message: "You already have an active hosting session." });
        }
        
        const { rows: [cohost] } = await client.query("SELECT user_id FROM co_hosts WHERE user_id = $1", [userId]);
        if (!cohost) {
            await client.query("INSERT INTO co_hosts (user_id, terms_agreed_at) VALUES ($1, NOW())", [userId]);
        } else if (!cohost.terms_agreed_at) {
             await client.query("UPDATE co_hosts SET terms_agreed_at = NOW() WHERE user_id = $1", [userId]);
        }

        const sessionId = crypto.randomUUID();
        const authToken = crypto.randomBytes(32).toString('hex');
        
        await client.query(
            "INSERT INTO hosting_sessions (id, co_host_user_id, auth_token, status, last_heartbeat) VALUES ($1, $2, $3, 'initializing', NOW())",
            [sessionId, userId, authToken]
        );

        await client.query('COMMIT');
        res.status(201).json({ message: "Session created. Please execute the provided script.", authToken: authToken });

    } catch (error) {
        await client.query('ROLLBACK');
        console.error("Error starting co-host session:", error);
        res.status(500).json({ message: "Failed to start a new hosting session." });
    } finally {
        client.release();
    }
});

// POST: Receive a heartbeat from an active co-host bot
router.post('/heartbeat', authenticateCohostBot, body('gems_collected_since_last').isInt({ min: 0 }), handleValidationErrors, async (req, res) => {
    const { sessionId, co_host_user_id, status } = req.sessionData;
    const { gems_collected_since_last } = req.body;
    
    try {
        const { rows: [cohost] } = await db.query("SELECT reliability_tier FROM co_hosts WHERE user_id = $1", [co_host_user_id]);
        if (!cohost) return res.status(404).json({ message: "Co-host record not found." });

        let gemShare = 0;
        if (gems_collected_since_last > 0) {
            const tierRates = { 1: 0.50, 2: 0.333, 3: 0.25 };
            const rate = tierRates[cohost.reliability_tier] || 0.25;
            gemShare = Math.floor(gems_collected_since_last * rate);
        }

        const updateQuery = `
            UPDATE hosting_sessions 
            SET last_heartbeat = NOW(), gems_earned = gems_earned + $1, status = CASE WHEN status = 'initializing' THEN 'active' ELSE status END
            WHERE id = $2
        `;
        await db.query(updateQuery, [gemShare, sessionId]);
        
        const command = status === 'winding_down' ? 'shutdown' : 'continue';
        res.status(200).json({ command });

    } catch (error) {
        console.error(`Heartbeat error for session ${sessionId}:`, error);
        res.status(500).json({ message: "Failed to process heartbeat." });
    }
});


// POST: User-initiated graceful shutdown
router.post('/shutdown', authenticateToken, async (req, res) => {
    const userId = req.user.userId;
    try {
        const { rowCount } = await db.query(
            "UPDATE hosting_sessions SET status = 'winding_down' WHERE co_host_user_id = $1 AND status = 'active'",
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
