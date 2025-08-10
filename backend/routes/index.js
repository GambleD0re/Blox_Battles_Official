const express = require('express');
const authRoutes = require('./auth.js');
const userRoutes = require('./users.js');
const duelRoutes = require('./duels.js');
const adminRoutes = require('./admin.js');
const taskRoutes = require('./tasks.js');
const gameDataRoutes = require('./gameData.js');
const logRoutes = require('./logs.js');
const statusRoutes = require('./status.js');
const paymentsRoutes = require('./payments.js');
const payoutRoutes = require('./payouts.js');
const inboxRoutes = require('./inbox.js');
const historyRoutes = require('./history.js');
const duelHistoryRoutes = require('./duelHistory.js');
const tournamentRoutes = require('./tournaments.js');
const transcriptRoutes = require('./transcripts.js');
const discordRoutes = require('./discord.js');
const ticketRoutes = require('./tickets.js');

const router = express.Router();

router.use('/auth', authRoutes);
router.use('/gamedata', gameDataRoutes);
router.use('/log', logRoutes);
router.use('/duels', duelRoutes);
router.use('/admin', adminRoutes);
router.use('/tasks', taskRoutes);
router.use('/status', statusRoutes);
router.use('/payments', paymentsRoutes);
router.use('/payouts', payoutRoutes);
router.use('/inbox', inboxRoutes);
router.use('/history', historyRoutes);
router.use('/duel-history', duelHistoryRoutes);
router.use('/tournaments', tournamentRoutes);
router.use('/discord', discordRoutes);
router.use('/tickets', ticketRoutes);
router.use('/transcripts', transcriptRoutes);

router.use('/', userRoutes);

module.exports = router;
