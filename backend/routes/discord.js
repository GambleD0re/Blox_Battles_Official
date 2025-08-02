// backend/routes/discord.js
const express = require('express');
const { body } = require('express-validator');
const db = require('../database/database');
const { authenticateToken, authenticateBot, handleValidationErrors } = require('../middleware/auth');
const crypto = require('crypto');

const router = express.Router();

// Endpoint for the Discord bot to initiate the linking process.
router.post('/initiate-link',
    authenticateBot,
    [
        body('robloxUsername').trim().notEmpty().withMessage('Roblox username is required.'),
        body('discordId').isString().notEmpty().withMessage('Discord ID is required.'),
        body('discordUsername').isString().notEmpty().withMessage('Discord username is required.')
    ],
    handleValidationErrors,
    async (req, res) => {
        const { robloxUsername, discordId, discordUsername } = req.body;
        const client = await db.getPool().connect();

        try {
            await client.query('BEGIN');

            // Find the user by their linked Roblox username.
            const { rows: [user] } = await client.query(
                "SELECT id, discord_id FROM users WHERE linked_roblox_username ILIKE $1",
                [robloxUsername]
            );

            if (!user) {
                await client.query('ROLLBACK');
                return res.status(404).json({ message: `No Blox Battles account found for Roblox user "${robloxUsername}". Please link your Roblox account on the website first.` });
            }

            if (user.discord_id) {
                await client.query('ROLLBACK');
                return res.status(409).json({ message: 'This Blox Battles account is already linked to a Discord account.' });
            }

            // Check if the Discord ID is already linked to another account.
            const { rows: [existingDiscordLink] } = await client.query(
                "SELECT id FROM users WHERE discord_id = $1",
                [discordId]
            );

            if (existingDiscordLink) {
                await client.query('ROLLBACK');
                return res.status(409).json({ message: 'This Discord account is already linked to another Blox Battles account.' });
            }

            // Create an inbox message for the user to confirm.
            const messageSql = `
                INSERT INTO inbox_messages (user_id, type, title, message, reference_id)
                VALUES ($1, 'discord_link_request', 'Discord Account Link Request', $2, $3)
            `;
            // We store the discord username in the message body and the discordId in the reference_id.
            await client.query(messageSql, [user.id, discordUsername, discordId]);

            await client.query('COMMIT');
            res.status(200).json({ message: 'Link request sent to the user on the Blox Battles website.' });

        } catch (error) {
            await client.query('ROLLBACK');
            console.error("Discord Initiate Link Error:", error);
            res.status(500).json({ message: 'An internal server error occurred.' });
        } finally {
            client.release();
        }
    }
);

// Endpoint for the frontend to respond to a link request.
router.post('/respond-link',
    authenticateToken,
    [
        body('messageId').isString().notEmpty(),
        body('response').isIn(['confirm', 'decline'])
    ],
    handleValidationErrors,
    async (req, res) => {
        const { messageId, response } = req.body;
        const userId = req.user.userId;
        const client = await db.getPool().connect();

        try {
            await client.query('BEGIN');

            // Find the specific message to ensure the user owns it.
            const numericId = parseInt(messageId.replace('message-', ''), 10);
            const { rows: [message] } = await client.query(
                "SELECT id, message, reference_id FROM inbox_messages WHERE id = $1 AND user_id = $2 AND type = 'discord_link_request'",
                [numericId, userId]
            );

            if (!message) {
                await client.query('ROLLBACK');
                return res.status(404).json({ message: 'Link request not found or invalid.' });
            }

            if (response === 'confirm') {
                const discordUsername = message.message;
                const discordId = message.reference_id;

                // Final check to prevent race conditions.
                const { rows: [existingLink] } = await client.query("SELECT id FROM users WHERE discord_id = $1", [discordId]);
                if (existingLink) {
                    await client.query("DELETE FROM inbox_messages WHERE id = $1", [numericId]);
                    await client.query('COMMIT');
                    return res.status(409).json({ message: 'This Discord account has already been linked by another user.' });
                }

                // Link the account.
                await client.query(
                    "UPDATE users SET discord_id = $1, discord_username = $2 WHERE id = $3",
                    [discordId, discordUsername, userId]
                );
            }

            // Delete the message regardless of the response.
            await client.query("DELETE FROM inbox_messages WHERE id = $1", [numericId]);

            await client.query('COMMIT');
            res.status(200).json({ message: `Discord account link ${response}ed.` });

        } catch (error) {
            await client.query('ROLLBACK');
            console.error("Discord Respond Link Error:", error);
            res.status(500).json({ message: 'An internal server error occurred.' });
        } finally {
            client.release();
        }
    }
);


module.exports = router;
