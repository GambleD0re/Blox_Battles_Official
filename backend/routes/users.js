// backend/routes/users.js
// This file handles routes for user data, settings, and Roblox account management.

console.log("--- Loading backend/routes/users.js ---"); // <-- DIAGNOSTIC LOG 1

const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const fetch = require('node-fetch');
const { body } = require('express-validator');
const db = require('../database/database');
const { authenticateToken, handleValidationErrors, validatePassword } = require('../middleware/auth');

const router = express.Router();

// --- CONFIGURATION ---
const saltRounds = 10;
const jwtSecret = process.env.JWT_SECRET;

// --- Helper Functions ---
const generateUniquePhrase = () => {
    const words = ['Apple', 'City', 'Run', 'Plane', 'Rock', 'Sky', 'Blue', 'Tree', 'Water', 'Fire', 'Sun', 'Moon', 'Star', 'Gold', 'King'];
    const shuffled = words.sort(() => 0.5 - Math.random());
    return "RR: " + shuffled.slice(0, 5).join(" ");
};

async function sendUserResponse(user, res) {
    if (user.linked_roblox_id) {
        try {
            const cleanRobloxId = parseInt(user.linked_roblox_id, 10);
            const avatarApiUrl = `https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${cleanRobloxId}&size=150x150&format=Png&isCircular=false`;
            const avatarResponse = await fetch(avatarApiUrl);
            const avatarData = await avatarResponse.json();

            if (avatarData.data && avatarData.data.length > 0 && avatarData.data[0].state === 'Completed' && avatarData.data[0].imageUrl) {
                user.roblox_avatar_url = avatarData.data[0].imageUrl;
            }
        } catch (apiError) {
            console.error("Failed to fetch Roblox avatar:", apiError);
        }
    }
    res.status(200).json(user);
}


// --- ROUTES ---

// Get User Data
// [MODIFIED] The SELECT statement now includes all ban-related fields.
router.get('/user-data', authenticateToken, async (req, res) => {
    try {
        const sql = `
            SELECT 
                id, email, google_id, gems, wins, losses, is_admin, 
                linked_roblox_id, linked_roblox_username, verification_phrase,
                created_at, password_last_updated, push_notifications_enabled,
                status, ban_reason, ban_applied_at, ban_expires_at
            FROM users WHERE id = ?
        `;
        const user = await db.get(sql, [req.user.userId]);

        if (!user) {
            return res.status(404).json({ message: 'User not found.' });
        }

        if (!user.linked_roblox_id && !user.verification_phrase) {
            const newPhrase = generateUniquePhrase();
            await db.run('UPDATE users SET verification_phrase = ? WHERE id = ?', [newPhrase, user.id]);
            user.verification_phrase = newPhrase;
        }
        
        await sendUserResponse(user, res);
    } catch(err) {
        console.error("Get User Data Error:", err.message);
        res.status(500).json({ message: 'An internal server error occurred.' });
    }
});

// Update Notification Preferences
router.put('/user/notification-preference', authenticateToken,
    body('enabled').isBoolean().withMessage('A boolean value for "enabled" is required.'),
    handleValidationErrors,
    async (req, res) => {
        const { enabled } = req.body;
        try {
            await db.run(
                'UPDATE users SET push_notifications_enabled = ? WHERE id = ?',
                [enabled, req.user.userId]
            );
            res.status(200).json({ message: 'Notification preferences updated successfully.' });
        } catch (err) {
            console.error("Update Notification Preference Error:", err.message);
            res.status(500).json({ message: 'An internal server error occurred.' });
        }
    }
);


// Update Email
router.put('/user/email', authenticateToken,
    body('email').isEmail().withMessage('A valid email is required.').normalizeEmail(),
    body('password').optional().notEmpty().withMessage('Password is required.'),
    handleValidationErrors,
    async (req, res) => {
        const { email, password } = req.body;
        try {
            const user = await db.get('SELECT * FROM users WHERE id = ?', [req.user.userId]);
            if (!user) { return res.status(404).json({ message: 'User not found.' }); }
            if (user.google_id) { return res.status(403).json({ message: 'Cannot change email for Google-linked accounts.' }); }
            if (!password) { return res.status(400).json({ message: 'Current password is required to change email.' }); }

            const isMatch = await bcrypt.compare(password, user.password_hash);
            if (!isMatch) { return res.status(401).json({ message: 'Incorrect password.' }); }

            await db.run('UPDATE users SET email = ? WHERE id = ?', [email, req.user.userId]);
            res.status(200).json({ message: 'Email updated successfully!' });
        } catch(err) {
            if (err.code === 'SQLITE_CONSTRAINT') {
                return res.status(409).json({ message: 'That email address is already in use.' });
            }
            console.error("Update Email Error:", err.message);
            res.status(500).json({ message: 'An internal server error occurred.' });
        }
    }
);

// Update Password
router.put('/user/password', authenticateToken,
    body('newPassword').notEmpty().withMessage('New password is required.'),
    handleValidationErrors,
    async (req, res) => {
        const { currentPassword, newPassword } = req.body;
        
        const passwordPolicy = validatePassword(newPassword);
        if (!passwordPolicy.valid) {
            return res.status(400).json({ message: passwordPolicy.message });
        }

        try {
            const user = await db.get('SELECT * FROM users WHERE id = ?', [req.user.userId]);
            if (!user) { return res.status(404).json({ message: 'User not found.' }); }
            if (!user.password_hash) { return res.status(403).json({ message: 'Cannot change password for Google-linked accounts.' }); }

            const isMatch = await bcrypt.compare(currentPassword, user.password_hash);
            if (!isMatch) { return res.status(401).json({ message: 'Incorrect current password.' }); }
            
            const hash = await bcrypt.hash(newPassword, saltRounds);
            await db.run(
                'UPDATE users SET password_hash = ?, password_last_updated = CURRENT_TIMESTAMP WHERE id = ?', 
                [hash, req.user.userId]
            );
            res.status(200).json({ message: 'Password changed successfully!' });
        } catch(err) {
            console.error("Change Password Error:", err.message);
            res.status(500).json({ message: 'An internal server error occurred.' });
        }
    }
);

// Verify Roblox Account
router.post('/roblox/verify', authenticateToken,
    body('robloxUsername').trim().escape().notEmpty().withMessage('Roblox username is required.'),
    handleValidationErrors,
    async (req, res) => {
        const { robloxUsername } = req.body;
        const userId = req.user.userId;

        try {
            const userRecord = await db.get('SELECT verification_phrase FROM users WHERE id = ?', [userId]);
            if (!userRecord || !userRecord.verification_phrase) { return res.status(400).json({ message: 'No verification phrase found. Please refresh the page.'}); }
            
            const existingRobloxUser = await db.get('SELECT id FROM users WHERE linked_roblox_username = ?', [robloxUsername]);
            if (existingRobloxUser) { return res.status(409).json({ message: 'That Roblox account is already linked to another user.' }); }

            const expectedPhrase = userRecord.verification_phrase;
            
            const usersApiUrl = 'https://users.roblox.com/v1/usernames/users';
            const usersResponse = await fetch(usersApiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
                body: JSON.stringify({ usernames: [robloxUsername], excludeBannedUsers: true })
            });
            if (!usersResponse.ok) throw new Error(`Roblox API (usernames) failed with status: ${usersResponse.status}`);
            const usersData = await usersResponse.json();

            if (!usersData.data || usersData.data.length === 0) {
                return res.status(404).json({ message: `Roblox user "${robloxUsername}" not found.` });
            }
            
            const robloxId = usersData.data[0].id.toString();
            const infoApiUrl = `https://users.roblox.com/v1/users/${robloxId}`;
            const infoResponse = await fetch(infoApiUrl);
            if (!infoResponse.ok) throw new Error(`Roblox API (user info) failed with status: ${infoResponse.status}`);
            const infoData = await infoResponse.json();

            const bio = infoData.description || "";

            if (bio.includes(expectedPhrase)) {
                const updateSql = `UPDATE users SET linked_roblox_id = ?, linked_roblox_username = ?, gems = gems + 100, verification_phrase = NULL WHERE id = ?`;
                await db.run(updateSql, [robloxId, robloxUsername, userId]);
                
                const payload = { userId: userId, username: robloxUsername };
                const token = jwt.sign(payload, jwtSecret, { expiresIn: '48h' });
                res.cookie('authToken', token, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', maxAge: 48 * 60 * 60 * 1000 });
                
                res.status(200).json({ message: 'Roblox account linked successfully! You earned 100 gems.' });
            } else {
                res.status(400).json({ message: 'Verification failed. The phrase was not found in your Roblox bio.' });
            }
        } catch (error) {
            console.error("Verification error:", error);
            res.status(500).json({ message: 'An internal server error occurred.' });
        }
    }
);

// Unlink Roblox Account
router.post('/user/unlink/roblox', authenticateToken, async (req, res) => {
    try {
        const newPhrase = generateUniquePhrase();
        await db.run('UPDATE users SET linked_roblox_id = NULL, linked_roblox_username = NULL, verification_phrase = ? WHERE id = ?', [newPhrase, req.user.userId]);
        res.status(200).json({ message: 'Roblox account unlinked successfully.' });
    } catch(err) {
        console.error("Unlink Roblox Error:", err.message);
        res.status(500).json({ message: 'An internal server error occurred.' });
    }
});

// Delete Account
router.delete('/user/delete/account', authenticateToken, 
    body('password').optional(),
    handleValidationErrors,
    async (req, res) => {
        const { password } = req.body;
        try {
            const user = await db.get('SELECT * FROM users WHERE id = ?', [req.user.userId]);
            if (!user) { return res.status(404).json({ message: 'User not found.' }); }

            const deleteUser = async () => {
                await db.run('DELETE FROM users WHERE id = ?', [req.user.userId]);
                res.clearCookie('authToken');
                res.status(200).json({ message: 'Account deleted successfully.' });
            };

            if (user.google_id) {
                return await deleteUser();
            }
            
            if (!password) {
                return res.status(400).json({ message: 'Password is required to delete your account.' });
            }
            
            const isMatch = await bcrypt.compare(password, user.password_hash);
            if (!isMatch) {
                return res.status(401).json({ message: 'Incorrect password.' });
            }

            await deleteUser();
        } catch(err) {
            console.error("Delete Account Error:", err.message);
            res.status(500).json({ message: 'An internal server error occurred.' });
        }
    }
);

console.log("--- Finished loading backend/routes/users.js. Exporting router. ---"); // <-- DIAGNOSTIC LOG 2
module.exports = router;