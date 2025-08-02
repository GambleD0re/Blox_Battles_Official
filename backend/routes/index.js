// backend/routes/index.js
const express = require('express');
const authRoutes = require('./auth.js');
const userRoutes = require('./users.js');
const duelRoutes = require('./duels.js');
const adminRoutes = require('./admin.js');
const taskRoutes = require('./tasks.js');
const gameDataRoutes = require('./gameData.js');
const subscriptionRoutes = require('./subscriptions.js');
const logRoutes = require('./logs.js');
const statusRoutes = require('./status.js');
const paymentsRoutes = require('./payments.js');
const payoutRoutes = require('./payouts.js');
const inboxRoutes = require('./inbox.js');
const historyRoutes = require('./history.js');
const duelHistoryRoutes = require('./duelHistory.js');
const tournamentRoutes = require('./tournaments.js');
// [NEW] Import the new public transcript router.
const transcriptRoutes = require('./transcripts.js');
// [NEW] Import the new Discord integration router.
const discordRoutes = require('./discord.js');

const router = express.Router();

// More specific routes should come FIRST
router.use('/auth', authRoutes);
router.use('/gamedata', gameDataRoutes);
router.use('/subscriptions', subscriptionRoutes);
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
// [NEW] Register the public transcript router.
router.use('/transcripts', transcriptRoutes);
// [NEW] Register the Discord integration router.
router.use('/discord', discordRoutes);


// The most general route ('/') should come LAST
router.use('/', userRoutes);

module.exports = router;
