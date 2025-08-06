// backend/routes/auth.js
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const passport = require('passport');
const { body } = require('express-validator');
const { handleValidationErrors, validatePassword } = require('../middleware/auth');
const db = require('../database/database');
const crypto = require('crypto');

const jwtSecret = process.env.JWT_SECRET;

// --- Local Registration ---
router.post('/register',
    [
        body('email').isEmail().withMessage('Please enter a valid email.').normalizeEmail(),
        body('password').custom(value => {
            const validation = validatePassword(value);
            if (!validation.valid) throw new Error(validation.message);
            return true;
        })
    ],
    handleValidationErrors,
    async (req, res) => {
        const { email, password } = req.body;
        try {
            const { rows } = await db.query('SELECT * FROM users WHERE email = $1', [email]);
            const existingUser = rows[0];
            
            if (existingUser && existingUser.status === 'terminated') {
                return res.status(403).json({ message: 'This email is associated with a terminated account and cannot be used again.' });
            }
            if (existingUser) {
                return res.status(409).json({ message: 'An account with this email already exists.' });
            }

            const hashedPassword = await bcrypt.hash(password, 10);
            const newUserId = crypto.randomUUID();
            
            const { rows: newRows } = await db.query(
                'INSERT INTO users (id, email, password_hash, is_admin) VALUES ($1, $2, $3, $4) RETURNING *', 
                [newUserId, email, hashedPassword, false]
            );
            const newUser = newRows[0];

            const payload = {
                userId: newUser.id,
                email: newUser.email,
                username: newUser.email,
                isAdmin: newUser.is_admin
            };
            const token = jwt.sign(payload, jwtSecret, { expiresIn: '1d' });
            
            res.status(201).json({ message: 'User registered successfully!', token: token });

        } catch (error) {
            console.error('Registration error:', error);
            res.status(500).json({ message: 'An internal server error occurred.' });
        }
    }
);

// --- Local Login ---
router.post('/login',
    [
        body('email').isEmail().normalizeEmail(),
        body('password').notEmpty()
    ],
    handleValidationErrors,
    async (req, res) => {
        const { email, password } = req.body;
        try {
            const { rows } = await db.query('SELECT * FROM users WHERE email = $1', [email]);
            const user = rows[0];

            if (!user || !user.password_hash) {
                return res.status(401).json({ message: 'Incorrect email or password.' });
            }

            if (user.status !== 'active') {
                if (user.status === 'banned') return res.status(403).json({ message: 'This account is currently banned.' });
                if (user.status === 'terminated') return res.status(403).json({ message: 'This account has been terminated.' });
                return res.status(403).json({ message: 'This account is not active.' });
            }

            const isMatch = await bcrypt.compare(password, user.password_hash);
            if (!isMatch) {
                return res.status(401).json({ message: 'Incorrect email or password.' });
            }
            
            const payload = {
                userId: user.id,
                email: user.email,
                username: user.linked_roblox_username || user.email,
                isAdmin: user.is_admin
            };
            const token = jwt.sign(payload, jwtSecret, { expiresIn: '1d' });

            res.json({ token, username: payload.username });
        } catch (error) {
            console.error('Login error:', error);
            res.status(500).json({ message: 'An internal server error occurred.' });
        }
    }
);

// --- Google OAuth Routes ---
router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

router.get('/google/callback',
    passport.authenticate('google', { failureRedirect: '/', session: false }),
    (req, res) => {
        const payload = {
            userId: req.user.id,
            email: req.user.email,
            username: req.user.linked_roblox_username || req.user.email,
            isAdmin: req.user.is_admin
        };
        const token = jwt.sign(payload, jwtSecret, { expiresIn: '1d' });

        // Redirect to the frontend with the token in the URL
        const frontendUrl = process.env.SERVER_URL || 'http://localhost:3000';
        res.redirect(`${frontendUrl}/?token=${token}`);
    }
);

// --- Logout ---
router.post('/logout', (req, res) => {
    res.status(200).json({ message: 'Logout handled client-side.' });
});

module.exports = router;
