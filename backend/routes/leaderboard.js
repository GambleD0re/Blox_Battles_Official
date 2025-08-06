// backend/routes/leaderboard.js
// This file handles the route for fetching leaderboard data.

const express = require('express');
const db = require('../database/database');
const { authenticateToken } = require('../middleware/auth');

const router = express.Router();

// --- ROUTES ---

// Get the top 10 players for the leaderboard, ordered by wins
router.get('/', authenticateToken, async (req, res) => {
    try {
        const sql = `
            SELECT 
                linked_roblox_username, 
                wins, 
                losses, 
                gems,
                linked_roblox_id
            FROM users
            WHERE linked_roblox_username IS NOT NULL
            ORDER BY wins DESC, gems DESC
            LIMIT 10;
        `;
        const leaderboard = await db.all(sql);

        // Fetch avatars for the top players
        const leaderboardWithAvatars = await Promise.all(leaderboard.map(async (player) => {
            let avatarUrl = null;
            if (player.linked_roblox_id) {
                try {
                    const avatarApiUrl = `https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${player.linked_roblox_id}&size=150x150&format=Png&isCircular=false`;
                    const avatarResponse = await fetch(avatarApiUrl);
                    const avatarData = await avatarResponse.json();
                    if (avatarData.data && avatarData.data.length > 0 && avatarData.data[0].state === 'Completed') {
                        avatarUrl = avatarData.data[0].imageUrl;
                    }
                } catch (e) {
                    console.error(`Failed to fetch avatar for ${player.linked_roblox_username}`, e);
                }
            }
            return { ...player, avatar_url: avatarUrl };
        }));

        res.status(200).json(leaderboardWithAvatars);
    } catch (err) {
        console.error("Get Leaderboard Error:", err.message);
        res.status(500).json({ message: 'An internal server error occurred.' });
    }
});


module.exports = router;
