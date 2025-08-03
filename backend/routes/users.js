// backend/routes/users.js
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const fetch = require('node-fetch');
const { body } = require('express-validator');
const db = require('../database/database');
const { authenticateToken, handleValidationErrors, validatePassword, MASTER_ADMIN_EMAIL } = require('../middleware/auth');

const router = express.Router();

const saltRounds = 10;
const jwtSecret = process.env.JWT_SECRET;

const generateUniquePhrase = () => {
    const words = ['Apple', 'City', 'Run', 'Plane', 'Rock', 'Sky', 'Blue', 'Tree', 'Water', 'Fire', 'Sun', 'Moon', 'Star', 'Gold', 'King'];
    const shuffled = words.sort(() => 0.5 - Math.random());
    return "RR: " + shuffled.slice(0, 5).join(" ");
};

async function sendUserResponse(user, res) {
    if (user.linked_roblox_id) {
        try {
            const cleanRobloxId = parseInt(user.linked_roblox_id, 10);
            if (!isNaN(cleanRobloxId)) {
                 const avatarApiUrl = `https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${cleanRobloxId}&size=150x150&format=Png&isCircular=false`;
                const avatarResponse = await fetch(avatarApiUrl);
                const avatarData = await avatarResponse.json();
                if (avatarData.data && avatarData.data.length > 0 && avatarData.data[0].state === 'Completed' && avatarData.data[0].imageUrl) {
                    user.roblox_avatar_url = avatarData.data[0].imageUrl;
                }
            }
        } catch (apiError) {
            console.error("Failed to fetch Roblox avatar:", apiError);
        }
    }
    res.status(200).json(user);
}

router.get('/user-data', authenticateToken, async (req, res) => {
    try {
        const userSql = `
            SELECT id, email, google_id, gems, wins, losses, is_admin, 
                   linked_roblox_id, linked_roblox_username, verification_phrase,
                   discord_id, discord_username,
                   created_at, password_last_updated, push_notifications_enabled,
                   status, ban_reason, ban_applied_at, ban_expires_at
            FROM users WHERE id = $1
        `;
        const { rows: [user] } = await db.query(userSql, [req.user.userId]);

        if (!user) {
            return res.status(404).json({ message: 'User not found.' });
        }
        
        const { rows: statusFlags } = await db.query('SELECT feature_name, is_enabled, disabled_message FROM system_status');
        const systemStatus = statusFlags.reduce((acc, flag) => {
            acc[flag.feature_name] = {
                isEnabled: flag.is_enabled,
                message: flag.disabled_message
            };
            return acc;
        }, {});

        // [MODIFIED] Master Admin Maintenance Mode Bypass
        // If the logged-in user is the master admin, override the maintenance flag
        // in the response object so they can access the site. This does NOT change the database value.
        if (user.email === MASTER_ADMIN_EMAIL && systemStatus.site_wide_maintenance) {
            systemStatus.site_wide_maintenance.isEnabled = true;
        }

        user.systemStatus = systemStatus;


        if (!user.linked_roblox_id && !user.verification_phrase) {
            const newPhrase = generateUniquePhrase();
            await db.query('UPDATE users SET verification_phrase = $1 WHERE id = $2', [newPhrase, user.id]);
            user.verification_phrase = newPhrase;
        }
        
        await sendUserResponse(user, res);
    } catch(err) {
        console.error("Get User Data Error:", err.message);
        res.status(500).json({ message: 'An internal server error occurred.' });
    }
});

router.put('/user/notification-preference', authenticateToken,
    body('enabled').isBoolean().withMessage('A boolean value for "enabled" is required.'),
    handleValidationErrors,
    async (req, res) => {
        const { enabled } = req.body;
        try {
            await db.query('UPDATE users SET push_notifications_enabled = $1 WHERE id = $2', [enabled, req.user.userId]);
            res.status(200).json({ message: 'Notification preferences updated successfully.' });
        } catch (err) {
            console.error("Update Notification Preference Error:", err.message);
            res.status(500).json({ message: 'An internal server error occurred.' });
        }
    }
);

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
            const { rows: [user] } = await db.query('SELECT * FROM users WHERE id = $1', [req.user.userId]);
            if (!user) { return res.status(404).json({ message: 'User not found.' }); }
            if (!user.password_hash) { return res.status(403).json({ message: 'Cannot change password for Google-linked accounts.' }); }

            const isMatch = await bcrypt.compare(currentPassword, user.password_hash);
            if (!isMatch) { return res.status(401).json({ message: 'Incorrect current password.' }); }
            
            const hash = await bcrypt.hash(newPassword, saltRounds);
            await db.query('UPDATE users SET password_hash = $1, password_last_updated = NOW() WHERE id = $2', [hash, req.user.userId]);
            res.status(200).json({ message: 'Password changed successfully!' });
        } catch(err) {
            console.error("Change Password Error:", err.message);
            res.status(500).json({ message: 'An internal server error occurred.' });
        }
    }
);

router.post('/roblox/verify', authenticateToken,
    body('robloxUsername').trim().escape().notEmpty().withMessage('Roblox username is required.'),
    handleValidationErrors,
    async (req, res) => {
        const { robloxUsername } = req.body;
        const userId = req.user.userId;

        try {
            const { rows: [userRecord] } = await db.query('SELECT verification_phrase FROM users WHERE id = $1', [userId]);
            if (!userRecord || !userRecord.verification_phrase) { return res.status(400).json({ message: 'No verification phrase found. Please refresh the page.'}); }
            
            const { rows: [existingRobloxUser] } = await db.query('SELECT id FROM users WHERE linked_roblox_username ILIKE $1', [robloxUsername]);
            if (existingRobloxUser) { return res.status(409).json({ message: 'That Roblox account is already linked to another user.' }); }

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

            if (infoData.description && infoData.description.includes(userRecord.verification_phrase)) {
                await db.query('UPDATE users SET linked_roblox_id = $1, linked_roblox_username = $2, gems = gems + 100, verification_phrase = NULL WHERE id = $3', [robloxId, robloxUsername, userId]);
                res.status(200).json({ message: 'Roblox account linked successfully! You earned 100 gems.' });
            } else {
                res.status(400).json({ message: 'Verification failed. The phrase was not found in your Roblox bio.' });
            }
        } catch (error) {
            console.error("Verification error:", error);
            if (error.code === '23505') {
                 return res.status(409).json({ message: 'That Roblox account is already linked to another user.' });
            }
            res.status(500).json({ message: 'An internal server error occurred.' });
        }
    }
);

router.post('/user/unlink/roblox', authenticateToken, async (req, res) => {
    try {
        const newPhrase = generateUniquePhrase();
        await db.query('UPDATE users SET linked_roblox_id = NULL, linked_roblox_username = NULL, verification_phrase = $1 WHERE id = $2', [newPhrase, req.user.userId]);
        res.status(200).json({ message: 'Roblox account unlinked successfully.' });
    } catch(err) {
        console.error("Unlink Roblox Error:", err.message);
        res.status(500).json({ message: 'An internal server error occurred.' });
    }
});

// [NEW] Unlink Discord account
router.post('/user/unlink/discord', authenticateToken, async (req, res) => {
    try {
        await db.query(
            'UPDATE users SET discord_id = NULL, discord_username = NULL WHERE id = $1',
            [req.user.userId]
        );
        res.status(200).json({ message: 'Discord account unlinked successfully.' });
    } catch(err) {
        console.error("Unlink Discord Error:", err.message);
        res.status(500).json({ message: 'An internal server error occurred.' });
    }
});

router.delete('/user/delete/account', authenticateToken, 
    body('password').optional(),
    handleValidationErrors,
    async (req, res) => {
        const { password } = req.body;
        const client = await db.getPool().connect();
        try {
            await client.query('BEGIN');
            const { rows: [user] } = await client.query('SELECT * FROM users WHERE id = $1 FOR UPDATE', [req.user.userId]);
            if (!user) { await client.query('ROLLBACK'); return res.status(404).json({ message: 'User not found.' }); }

            const deleteUser = async () => {
                await client.query('DELETE FROM users WHERE id = $1', [req.user.userId]);
                await client.query('COMMIT');
                res.clearCookie('authToken');
                res.status(200).json({ message: 'Account deleted successfully.' });
            };

            if (user.google_id) {
                return await deleteUser();
            }
            
            if (!password) {
                await client.query('ROLLBACK');
                return res.status(400).json({ message: 'Password is required to delete your account.' });
            }
            
            const isMatch = await bcrypt.compare(password, user.password_hash);
            if (!isMatch) {
                await client.query('ROLLBACK');
                return res.status(401).json({ message: 'Incorrect password.' });
            }

            await deleteUser();
        } catch(err) {
            await client.query('ROLLBACK');
            console.error("Delete Account Error:", err.message);
            res.status(500).json({ message: 'An internal server error occurred.' });
        } finally {
            client.release();
        }
    }
);

module.exports = router;
