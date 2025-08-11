const express = require('express');
const { body } = require('express-validator');
const db = require('../database/database');
const { authenticateToken, authenticateBot, handleValidationErrors } = require('../middleware/auth');
const GAME_DATA = require('../game-data-store');

const router = express.Router();

router.post('/update-ticket-channel',
    authenticateBot,
    [
        body('ticketId').isUUID().withMessage('A valid ticket ID is required.'),
        body('channelId').isString().notEmpty().withMessage('Channel ID is required.'),
    ],
    handleValidationErrors,
    async (req, res) => {
        const { ticketId, channelId } = req.body;
        try {
            await db.query("UPDATE tickets SET discord_channel_id = $1 WHERE id = $2", [channelId, ticketId]);
            res.status(200).json({ message: 'Ticket channel ID updated.' });
        } catch (error) {
            console.error('Update Ticket Channel Error:', error);
            res.status(500).json({ message: 'An internal server error occurred.' });
        }
    }
);

router.post('/update-ticket-status',
    authenticateBot,
    [
        body('ticketId').isUUID().withMessage('A valid ticket ID is required.'),
        body('status').isIn(['resolved', 'closed']).withMessage('Invalid status provided.'),
        body('adminDiscordId').isString().notEmpty().withMessage('Admin Discord ID is required.'),
    ],
    handleValidationErrors,
    async (req, res) => {
        const { ticketId, status, adminDiscordId } = req.body;
        const client = await db.getPool().connect();
        try {
            await client.query('BEGIN');
            
            const { rows: [adminUser] } = await client.query('SELECT id FROM users WHERE trim(discord_id) = trim($1)', [adminDiscordId]);

            const { rowCount } = await client.query(
                "UPDATE tickets SET status = $1, resolved_by_admin_id = $2, resolved_at = NOW(), updated_at = NOW() WHERE id = $3",
                [status, adminUser ? adminUser.id : null, ticketId]
            );

            if (rowCount === 0) {
                await client.query('ROLLBACK');
                return res.status(404).json({ message: 'Ticket not found or already has this status.' });
            }

            await client.query('COMMIT');
            res.status(200).json({ message: `Ticket ${ticketId} status updated to ${status}.` });

        } catch (error) {
            await client.query('ROLLBACK');
            console.error('Update Ticket Status Error:', error);
            res.status(500).json({ message: 'An internal server error occurred.' });
        } finally {
            client.release();
        }
    }
);

router.post('/check-user',
    authenticateBot,
    [ body('discordId').isString().notEmpty().withMessage('Discord ID is required.') ],
    handleValidationErrors,
    async (req, res) => {
        const { discordId } = req.body;
        try {
            const { rows: [user] } = await db.query('SELECT id, status FROM users WHERE trim(discord_id) = trim($1)', [discordId]);
            if (!user) {
                return res.status(200).json({ user: null });
            }

            const { rows: openTickets } = await db.query(
                "SELECT type FROM tickets WHERE user_id = $1 AND status IN ('open', 'in_progress', 'awaiting_user_reply')",
                [user.id]
            );

            res.status(200).json({ user: { status: user.status, open_tickets: openTickets } });
        } catch (error) {
            console.error('Discord Check User Error:', error);
            res.status(500).json({ message: 'An internal server error occurred.' });
        }
    }
);

router.post('/create-ticket',
    authenticateBot,
    [
        body('discordId').isString().notEmpty(),
        body('ticketType').isIn(['support', 'ban_appeal']),
        body('subject').trim().notEmpty(),
        body('description').trim().notEmpty(),
    ],
    handleValidationErrors,
    async (req, res) => {
        const { discordId, ticketType, subject, description } = req.body;
        const client = await db.getPool().connect();
        try {
            await client.query('BEGIN');
            const { rows: [user] } = await client.query("SELECT id, status FROM users WHERE trim(discord_id) = trim($1)", [discordId]);
            if (!user) {
                await client.query('ROLLBACK');
                return res.status(404).json({ message: 'No linked Blox Battles account found for this Discord user.' });
            }

            let finalTicketType = ticketType;
            if (ticketType === 'ban_appeal') {
                finalTicketType = user.status === 'banned' ? 'temp_ban_appeal' : 'perm_ban_appeal';
            }

            const { rows: [newTicket] } = await client.query(
                'INSERT INTO tickets (user_id, type, subject) VALUES ($1, $2, $3) RETURNING id',
                [user.id, finalTicketType, subject]
            );
            
            await client.query(
                'INSERT INTO ticket_messages (ticket_id, author_id, message) VALUES ($1, $2, $3)',
                [newTicket.id, user.id, description]
            );

            const taskPayload = { ticket_id: newTicket.id, user_discord_id: discordId, ticket_type: finalTicketType, subject };
            await client.query("INSERT INTO tasks (task_type, payload) VALUES ('CREATE_TICKET_CHANNEL', $1)", [JSON.stringify(taskPayload)]);

            await client.query('COMMIT');
            res.status(201).json({ message: '✅ Your ticket has been created! A private channel will be opened for you shortly.' });

        } catch (error) {
            await client.query('ROLLBACK');
            console.error('Discord Create Ticket Error:', error);
            res.status(500).json({ message: 'An internal server error occurred.' });
        } finally {
            client.release();
        }
    }
);

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
            const { rows: [user] } = await client.query("SELECT id, discord_id FROM users WHERE linked_roblox_username ILIKE $1", [robloxUsername]);
            if (!user) {
                await client.query('ROLLBACK');
                return res.status(404).json({ message: `No Blox Battles account found for Roblox user "${robloxUsername}". Please link your Roblox account on the website first.` });
            }
            if (user.discord_id) {
                await client.query('ROLLBACK');
                return res.status(409).json({ message: 'This Blox Battles account is already linked to a Discord account.' });
            }
            const { rows: [existingDiscordLink] } = await client.query("SELECT id FROM users WHERE trim(discord_id) = trim($1)", [discordId]);
            if (existingDiscordLink) {
                await client.query('ROLLBACK');
                return res.status(409).json({ message: 'This Discord account is already linked to another Blox Battles account.' });
            }
            const messageSql = `
                INSERT INTO inbox_messages (user_id, type, title, message, reference_id)
                VALUES ($1, 'discord_link_request', 'Discord Account Link Request', $2, $3)
            `;
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

router.post('/respond-link',
    authenticateToken,
    [ body('messageId').isString().notEmpty(), body('response').isIn(['confirm', 'decline']) ],
    handleValidationErrors,
    async (req, res) => {
        const { messageId, response } = req.body;
        const userId = req.user.userId;
        const client = await db.getPool().connect();
        try {
            await client.query('BEGIN');
            const numericId = parseInt(messageId.replace('message-', ''), 10);
            const { rows: [message] } = await client.query("SELECT id, message, reference_id FROM inbox_messages WHERE id = $1 AND user_id = $2 AND type = 'discord_link_request'", [numericId, userId]);
            if (!message) {
                await client.query('ROLLBACK');
                return res.status(404).json({ message: 'Link request not found or invalid.' });
            }
            if (response === 'confirm') {
                const discordUsername = message.message;
                const discordId = message.reference_id;
                const { rows: [existingLink] } = await client.query("SELECT id FROM users WHERE trim(discord_id) = trim($1)", [discordId]);
                if (existingLink) {
                    await client.query("DELETE FROM inbox_messages WHERE id = $1", [numericId]);
                    await client.query('COMMIT');
                    return res.status(409).json({ message: 'This Discord account has already been linked by another user.' });
                }
                await client.query("UPDATE users SET discord_id = $1, discord_username = $2 WHERE id = $3", [discordId, discordUsername, userId]);
                const taskPayload = { discordId: discordId };
                await client.query("INSERT INTO tasks (task_type, payload) VALUES ('SEND_DISCORD_LINK_SUCCESS_DM', $1)", [JSON.stringify(taskPayload)]);
            }
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

router.post('/unlink',
    authenticateBot,
    [ body('discordId').isString().notEmpty().withMessage('Discord ID is required.') ],
    handleValidationErrors,
    async (req, res) => {
        const { discordId } = req.body;
        try {
            const { rowCount } = await db.query("UPDATE users SET discord_id = NULL, discord_username = NULL WHERE trim(discord_id) = trim($1)", [discordId]);
            if (rowCount === 0) {
                return res.status(404).json({ message: "No Blox Battles account is linked to this Discord account." });
            }
            res.status(200).json({ message: "Account unlinked successfully." });
        } catch (error) {
            console.error("Discord Unlink Error:", error);
            res.status(500).json({ message: "An internal server error occurred." });
        }
    }
);

router.post('/duels/pre-check', authenticateBot,
    [
        body('challengerDiscordId').isString().notEmpty(),
        body('opponentDiscordId').isString().notEmpty()
    ],
    handleValidationErrors,
    async (req, res) => {
        const { challengerDiscordId, opponentDiscordId } = req.body;
        try {
            const sql = 'SELECT id, linked_roblox_username, discord_id, gems, accepting_challenges FROM users WHERE trim(discord_id) = ANY(TRIM(unnest($1::varchar[])))';
            const { rows: users } = await db.query(sql, [[challengerDiscordId, opponentDiscordId]]);

            const challenger = users.find(u => u.discord_id.trim() === challengerDiscordId.trim());
            const opponent = users.find(u => u.discord_id.trim() === opponentDiscordId.trim());

            if (!challenger) return res.status(400).json({ message: "You must link your Discord account before challenging others. Use `/link`." });
            if (!opponent) return res.status(400).json({ message: "Your opponent has not linked their Blox Battles account to Discord yet." });
            
            if (!opponent.accepting_challenges) {
                return res.status(403).json({ message: "This player is not currently accepting challenges." });
            }

            res.status(200).json({
                message: "Both users are eligible.",
                challenger: { gems: challenger.gems },
                opponent: { username: opponent.linked_roblox_username }
            });
        } catch (error) {
            console.error("Discord Duel Pre-check Error:", error);
            res.status(500).json({ message: "An internal server error occurred during pre-check." });
        }
    }
);

router.post('/duels/create', authenticateBot,
    [
        body('challengerDiscordId').isString().notEmpty(),
        body('opponentDiscordId').isString().notEmpty(),
        body('wager').isInt({ gt: 0 }),
        body('map').isString().notEmpty(),
    ],
    handleValidationErrors,
    async (req, res) => {
        const { challengerDiscordId, opponentDiscordId, wager, map, region, banned_weapons } = req.body;
        const client = await db.getPool().connect();
        try {
            await client.query('BEGIN');
            const userSql = 'SELECT id, gems, discord_id, linked_roblox_username, discord_notifications_enabled FROM users WHERE trim(discord_id) = ANY(TRIM(unnest($1::varchar[]))) FOR UPDATE';
            const { rows: users } = await client.query(userSql, [[challengerDiscordId, opponentDiscordId]]);
            
            const challenger = users.find(u => u.discord_id.trim() === challengerDiscordId.trim());
            const opponent = users.find(u => u.discord_id.trim() === opponentDiscordId.trim());

            if (!challenger || !opponent) {
                await client.query('ROLLBACK');
                return res.status(404).json({ message: "One or both users could not be found." });
            }
            if (parseInt(challenger.gems) < wager) {
                await client.query('ROLLBACK');
                return res.status(400).json({ message: "Challenger has insufficient gems for this wager." });
            }
            
            const bannedWeaponsStr = JSON.stringify(banned_weapons || []);
            const { rows: [newDuel] } = await client.query(
                'INSERT INTO duels (challenger_id, opponent_id, wager, banned_weapons, map, region) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
                [challenger.id, opponent.id, wager, bannedWeaponsStr, map, region]
            );

            if (opponent.discord_id && opponent.discord_notifications_enabled) {
                const mapInfo = GAME_DATA.maps.find(m => m.id === map);
                const taskPayload = {
                    recipientDiscordId: opponent.discord_id,
                    challengerUsername: challenger.linked_roblox_username,
                    wager: wager,
                    mapName: mapInfo ? mapInfo.name : map
                };
                await client.query("INSERT INTO tasks (task_type, payload) VALUES ('SEND_DUEL_CHALLENGE_DM', $1)", [JSON.stringify(taskPayload)]);
            }

            await client.query('COMMIT');
            res.status(201).json({ message: 'Challenge created successfully!', duelId: newDuel.id });
        } catch (error) {
            await client.query('ROLLBACK');
            console.error("Discord Duel Create Error:", error);
            res.status(500).json({ message: "An internal server error occurred while creating the duel." });
        } finally {
            client.release();
        }
    }
);

router.post('/duels/respond', authenticateBot,
    [
        body('duelId').isInt(),
        body('discordId').isString().notEmpty(),
        body('response').isIn(['accept', 'decline']),
    ],
    handleValidationErrors,
    async (req, res) => {
        const { duelId, discordId, response } = req.body;
        const client = await db.getPool().connect();
        try {
            await client.query('BEGIN');

            const { rows: [user] } = await client.query("SELECT id, gems, status, linked_roblox_username FROM users WHERE trim(discord_id) = trim($1) FOR UPDATE", [discordId]);
            if (!user) { await client.query('ROLLBACK'); return res.status(404).json({ message: 'Responding user not found.' }); }
            
            const { rows: [duel] } = await client.query("SELECT * FROM duels WHERE id = $1 AND opponent_id = $2 AND status = 'pending' FOR UPDATE", [duelId, user.id]);
            if (!duel) { await client.query('ROLLBACK'); return res.status(404).json({ message: 'Duel not found, not pending, or you are not the opponent.' }); }

            if (response === 'decline') {
                await client.query('UPDATE duels SET status = $1 WHERE id = $2', ['declined', duelId]);
                await client.query('COMMIT');
                return res.status(200).json({ message: 'Duel declined.' });
            }
            
            if (user.status === 'banned') { await client.query('ROLLBACK'); return res.status(403).json({ message: 'You cannot accept duels while banned.' }); }
            if (parseInt(user.gems) < parseInt(duel.wager)) { await client.query('ROLLBACK'); return res.status(400).json({ message: 'You do not have enough gems.' }); }

            const { rows: [challenger] } = await client.query('SELECT gems, discord_id, discord_notifications_enabled FROM users WHERE id = $1 FOR UPDATE', [duel.challenger_id]);
            if (!challenger || parseInt(challenger.gems) < parseInt(duel.wager)) { await client.query('ROLLBACK'); return res.status(400).json({ message: 'The challenger no longer has enough gems.' }); }

            await client.query('UPDATE users SET gems = gems - $1 WHERE id = $2', [duel.wager, user.id]);
            await client.query('UPDATE users SET gems = gems - $1 WHERE id = $2', [duel.wager, duel.challenger_id]);
            
            const totalPot = parseInt(duel.wager) * 2;
            const taxCollected = totalPot > 99 ? Math.ceil(totalPot * 0.04) : 0;
            const finalPot = totalPot - taxCollected;
            
            await client.query('UPDATE duels SET status = $1, accepted_at = NOW(), pot = $2, tax_collected = $3 WHERE id = $4', ['accepted', finalPot, taxCollected, duelId]);
            
            if (challenger.discord_id && challenger.discord_notifications_enabled) {
                const taskPayload = { recipientDiscordId: challenger.discord_id, opponentUsername: user.linked_roblox_username, duelId: duel.id };
                await client.query("INSERT INTO tasks (task_type, payload) VALUES ('SEND_DUEL_ACCEPTED_DM', $1)", [JSON.stringify(taskPayload)]);
            }

            await client.query('COMMIT');
            res.status(200).json({ message: 'Duel accepted!' });
        } catch (error) {
            await client.query('ROLLBACK');
            console.error("Discord Respond to Duel Error:", error);
            res.status(500).json({ message: "An internal server error occurred." });
        } finally {
            client.release();
        }
    }
);

router.post('/duels/cancel', authenticateBot,
    [ body('duelId').isInt() ],
    handleValidationErrors,
    async(req, res) => {
        const { duelId } = req.body;
        try {
            await db.query("UPDATE duels SET status = 'canceled' WHERE id = $1 AND status = 'pending'", [duelId]);
            res.status(200).json({ message: "Duel canceled." });
        } catch (error) {
            console.error("Discord Duel Cancel Error:", error);
            res.status(500).json({ message: "An internal server error occurred." });
        }
    }
);

module.exports = router;
