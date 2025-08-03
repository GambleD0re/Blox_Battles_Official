// backend/middleware/auth.js
const jwt = require('jsonwebtoken');
const { validationResult } = require('express-validator');
const db = require('../database/database');

const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret) {
    throw new Error("FATAL ERROR: JWT_SECRET is not defined in .env file.");
}

const ADMIN_TEST_KEY = process.env.ADMIN_TEST_API_KEY;
const MASTER_ADMIN_EMAIL = 'scriptmail00@gmail.com'; // The master admin user

/**
 * Middleware to authenticate a user's JWT token or a special admin test key.
 */
const authenticateToken = (req, res, next) => {
    const testKey = req.headers['x-admin-test-key'];
    if (ADMIN_TEST_KEY && testKey === ADMIN_TEST_KEY) {
        req.user = {
            userId: 'admin-test-user',
            email: 'admin-test@example.com',
            username: 'CURL_Admin',
            isAdmin: true
        };
        return next();
    }
    
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (token == null) {
        return res.status(401).json({ message: 'Access token is missing or invalid.' });
    }

    jwt.verify(token, jwtSecret, (err, user) => {
        if (err) {
            return res.status(403).json({ message: 'Forbidden: Invalid or expired token.' });
        }
        req.user = user;
        next();
    });
};

/**
 * Middleware to authenticate the bot via its API key.
 */
const authenticateBot = (req, res, next) => {
    const apiKey = req.headers['x-api-key'];
    if (!process.env.BOT_API_KEY) {
        console.error("FATAL ERROR: BOT_API_KEY is not defined in .env file.");
        return res.status(500).json({ message: 'Server configuration error: BOT_API_KEY missing.' });
    }
    if (!apiKey || apiKey !== process.env.BOT_API_KEY) {
        console.warn(`Unauthorized bot access attempt from IP: ${req.ip} with API Key: ${apiKey}`);
        return res.status(401).json({ message: 'Unauthorized: Invalid or missing API key.' });
    }
    next();
};


/**
 * Middleware to handle validation errors from express-validator.
 */
const handleValidationErrors = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        const errorMessages = errors.array().map(err => err.msg);
        return res.status(400).json({ message: errorMessages[0] });
    }
    next();
};

/**
 * Validates the password against the defined policy.
 */
const validatePassword = (password) => {
    const minLength = 8;
    const hasNumber = /\d/;
    const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/;
    if (password.length < minLength) {
        return { valid: false, message: 'Password must be at least 8 characters long.' };
    }
    if (!hasNumber.test(password)) {
        return { valid: false, message: 'Password must contain at least one number.' };
    }
    if (!hasSpecialChar.test(password)) {
        return { valid: false, message: 'Password must contain at least one special character.' };
    }
    return { valid: true };
};

/**
 * Middleware to check if the authenticated user is an administrator.
 * [REFACTORED FOR PG]
 */
const isAdmin = async (req, res, next) => {
    if (req.user && req.user.isAdmin) {
        return next();
    }
    
    try {
        if (!req.user || !req.user.userId) {
             return res.status(403).json({ message: 'Forbidden: Invalid user token.' });
        }
        const { rows } = await db.query('SELECT is_admin FROM users WHERE id = $1', [req.user.userId]);
        const user = rows[0];

        if (user && user.is_admin) {
            next();
        } else {
            res.status(403).json({ message: 'Forbidden: Requires admin privileges.' });
        }
    } catch (error) {
        console.error("Admin check error:", error);
        res.status(500).json({ message: 'An internal server error occurred during admin check.' });
    }
};

// [NEW] Middleware to check if the user is the master admin.
const isMasterAdmin = async (req, res, next) => {
    try {
        if (!req.user || !req.user.userId) {
            return res.status(403).json({ message: 'Forbidden: Invalid user token.' });
        }
        const { rows } = await db.query('SELECT email, is_admin FROM users WHERE id = $1', [req.user.userId]);
        const user = rows[0];

        if (user && user.is_admin && user.email === MASTER_ADMIN_EMAIL) {
            next();
        } else {
            res.status(403).json({ message: 'Forbidden: Requires master admin privileges.' });
        }
    } catch (error) {
        console.error("Master Admin check error:", error);
        res.status(500).json({ message: 'An internal server error occurred during master admin check.' });
    }
};


module.exports = {
    authenticateToken,
    handleValidationErrors,
    validatePassword,
    isAdmin,
    authenticateBot,
    isMasterAdmin,
};
