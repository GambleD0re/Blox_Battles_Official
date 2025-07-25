// backend/server.js
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const passport = require('passport');
const cookieParser = require('cookie-parser');
const morgan = require('morgan');
const webpush = require('web-push');
const db = require('./database/database');
const util = require('util');
const crypto = require('crypto');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const { botLogger } = require('./middleware/botLogger');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// Import the new services for crypto deposits
const { startTransactionListener } = require('./services/transactionListenerService');
const { startConfirmationService } = require('./services/transactionConfirmationService');


db.get = util.promisify(db.get);
db.run = util.promisify(db.run);
db.all = util.promisify(db.all);

const app = express();
const PORT = process.env.PORT || 3001;

// --- Web Push Configuration ---
if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    webpush.setVapidDetails(
        'mailto:youremail@example.com',
        process.env.VAPID_PUBLIC_KEY,
        process.env.VAPID_PRIVATE_KEY
    );
    console.log("Web Push configured successfully.");
} else {
    console.warn("VAPID keys not found in .env file. Push notifications will be disabled.");
}

// --- Middleware Setup ---
app.use(cors({ origin: `http://localhost:3000`, credentials: true }));
app.use(cookieParser());
app.use(passport.initialize());
app.use(morgan('dev'));


// --- Stripe Webhook Handler ---
app.post('/api/payments/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
    const sig = req.headers['stripe-signature'];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    let event;

    try {
        event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } catch (err) {
        console.error(`Webhook signature verification failed.`, err.message);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    if (event.type === 'checkout.session.completed') {
        const session = event.data.object;
        const { userId, gemAmount } = session.metadata;
        const sessionId = session.id;
        const amountPaid = session.amount_total;
        const currency = session.currency;
        const gemAmountInt = parseInt(gemAmount, 10);

        try {
            // [MODIFIED] Querying the new 'gem_purchases' table
            const existingTransaction = await db.get('SELECT id FROM gem_purchases WHERE stripe_session_id = ?', [sessionId]);
            if (existingTransaction) {
                console.log(`Webhook Info: Received duplicate event for session ${sessionId}. Ignoring.`);
                return res.status(200).json({ received: true, message: 'Duplicate event.' });
            }

            await db.run('BEGIN TRANSACTION');
            
            await db.run('UPDATE users SET gems = gems + ? WHERE id = ?', [gemAmountInt, userId]);
            
            // [MODIFIED] Inserting into the new 'gem_purchases' table
            await db.run(
                'INSERT INTO gem_purchases (user_id, stripe_session_id, gem_amount, amount_paid, currency, status) VALUES (?, ?, ?, ?, ?, ?)',
                [userId, sessionId, gemAmountInt, amountPaid, currency, 'completed']
            );

            // [NEW] Create a record in the unified transaction_history
            await db.run(
                'INSERT INTO transaction_history (user_id, type, amount_gems, description) VALUES (?, ?, ?, ?)',
                [userId, 'deposit_stripe', gemAmountInt, `${gemAmountInt} Gems purchased via Card`]
            );

            await db.run('COMMIT');
            console.log(`Gems awarded successfully for session ${sessionId}. User: ${userId}, Gems: ${gemAmount}`);
        } catch (dbError) {
            await db.run('ROLLBACK').catch(console.error);
            console.error(`DATABASE ERROR during webhook processing for session ${sessionId}:`, dbError.message);
            return res.status(500).json({ error: 'Database processing failed.' });
        }
    }

    res.status(200).json({ received: true });
});

// --- Global JSON Parser ---
app.use(express.json());


// --- Passport Strategy ---
passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: `/api/auth/google/callback`
  },
  async function(accessToken, refreshToken, profile, done) {
    const googleId = profile.id;
    const email = profile.emails[0].value;
    try {
      let user = await db.get('SELECT * FROM users WHERE google_id = ?', [googleId]);
      if (user) { return done(null, user); }
      user = await db.get('SELECT * FROM users WHERE email = ?', [email]);
      if (user) {
        await db.run('UPDATE users SET google_id = ? WHERE id = ?', [googleId, user.id]);
        const updatedUser = await db.get('SELECT * FROM users WHERE id = ?', [user.id]);
        return done(null, updatedUser);
      }
      const newUserId = crypto.randomUUID();
      await db.run('INSERT INTO users (id, google_id, email) VALUES (?, ?, ?)', [newUserId, googleId, email]);
      const newUser = await db.get('SELECT * FROM users WHERE id = ?', [newUserId]);
      return done(null, newUser);
    } catch (err) {
      console.error("Google Strategy Error:", err);
      return done(err);
    }
  }
));

// --- Scheduled Task for Expired and Forfeited Duels ---
// [FIX] Restored the full, unchanged scheduled tasks logic.
const DUEL_EXPIRATION_HOURS = 1;
const DUEL_FORFEIT_MINUTES = 10;
const CHECK_INTERVAL_MINUTES = 1;

async function runScheduledTasks() {
    console.log(`[CRON] Running scheduled tasks at ${new Date().toISOString()}`);
    
    // Task 1: Cancel old 'accepted' duels that were never started
    try {
        const acceptedSql = `
            SELECT id, challenger_id, opponent_id, pot 
            FROM duels 
            WHERE status = 'accepted' AND accepted_at <= datetime('now', '-${DUEL_EXPIRATION_HOURS} hour')
        `;
        const expiredAcceptedDuels = await db.all(acceptedSql);
        for (const duel of expiredAcceptedDuels) {
            await db.run('BEGIN TRANSACTION');
            const refundAmount = duel.pot / 2;
            await db.run('UPDATE users SET gems = gems + ? WHERE id = ?', [refundAmount, duel.challenger_id]);
            await db.run('UPDATE users SET gems = gems + ? WHERE id = ?', [refundAmount, duel.opponent_id]);
            await db.run("UPDATE duels SET status = 'canceled' WHERE id = ?", [duel.id]);
            await db.run('COMMIT');
            console.log(`[CRON] Canceled expired 'accepted' duel ID ${duel.id}. Pot of ${duel.pot} refunded.`);
        }
    } catch (error) {
        console.error('[CRON] Error canceling old accepted duels:', error);
    }

    // Task 2: Handle 'started' duels that were not played/completed within the time limit (forfeit logic)
    try {
        const startedSql = `
            SELECT id, challenger_id, opponent_id, pot, transcript 
            FROM duels 
            WHERE status = 'started' AND started_at <= datetime('now', '-${DUEL_FORFEIT_MINUTES} minute')
        `;
        const expiredStartedDuels = await db.all(startedSql);

        for (const duel of expiredStartedDuels) {
            await db.run('BEGIN TRANSACTION');
            try {
                const challenger = await db.get('SELECT id, linked_roblox_username FROM users WHERE id = ?', [duel.challenger_id]);
                const opponent = await db.get('SELECT id, linked_roblox_username FROM users WHERE id = ?', [duel.opponent_id]);

                let transcript = [];
                try {
                    transcript = JSON.parse(duel.transcript || '[]');
                } catch (e) {
                    console.error(`[CRON] Could not parse transcript for duel ${duel.id}. Defaulting to no-show.`);
                }

                const joinedPlayers = new Set(
                    transcript
                        .filter(event => event.eventType === 'PLAYER_JOINED_DUEL' && event.data && event.data.playerName)
                        .map(event => event.data.playerName)
                );

                const challengerJoined = joinedPlayers.has(challenger.linked_roblox_username);
                const opponentJoined = joinedPlayers.has(opponent.linked_roblox_username);

                if (!challengerJoined && !opponentJoined) {
                    const refundAmount = duel.pot / 2;
                    await db.run('UPDATE users SET gems = gems + ? WHERE id = ?', [refundAmount, duel.challenger_id]);
                    await db.run('UPDATE users SET gems = gems + ? WHERE id = ?', [refundAmount, duel.opponent_id]);
                    await db.run("UPDATE duels SET status = 'canceled', winner_id = NULL WHERE id = ?", [duel.id]);
                    console.log(`[CRON] Duel ID ${duel.id} canceled (no-show from both). Pot of ${duel.pot} refunded.`);
                } 
                else if (challengerJoined && !opponentJoined) {
                    await db.run('UPDATE users SET gems = gems + ?, wins = wins + 1 WHERE id = ?', [duel.pot, duel.challenger_id]);
                    await db.run('UPDATE users SET losses = losses + 1 WHERE id = ?', [duel.opponent_id]);
                    await db.run("UPDATE duels SET status = 'completed', winner_id = ? WHERE id = ?", [duel.challenger_id, duel.id]);
                    console.log(`[CRON] Duel ID ${duel.id} forfeited by ${opponent.linked_roblox_username}. Winner ${challenger.linked_roblox_username} receives pot of ${duel.pot}.`);
                } 
                else if (!challengerJoined && opponentJoined) {
                    await db.run('UPDATE users SET gems = gems + ?, wins = wins + 1 WHERE id = ?', [duel.pot, duel.opponent_id]);
                    await db.run('UPDATE users SET losses = losses + 1 WHERE id = ?', [duel.challenger_id]);
                    await db.run("UPDATE duels SET status = 'completed', winner_id = ? WHERE id = ?", [duel.opponent_id, duel.id]);
                    console.log(`[CRON] Duel ID ${duel.id} forfeited by ${challenger.linked_roblox_username}. Winner ${opponent.linked_roblox_username} receives pot of ${duel.pot}.`);
                }
                else {
                    console.log(`[CRON] Duel ID ${duel.id} is still considered active (both players joined). No action taken.`);
                }

                await db.run('COMMIT');
            } catch (err) {
                await db.run('ROLLBACK');
                console.error(`[CRON] Error processing forfeit for duel ID ${duel.id}:`, err);
            }
        }
    } catch (error) {
        console.error('[CRON] Error fetching or processing no-show forfeits:', error);
    }
}


// --- API Routes ---
const apiRoutes = require('./routes');
app.use('/api', botLogger, apiRoutes);

// --- Server Startup ---
app.listen(PORT, () => {
    console.log(`Backend API server listening on http://localhost:${PORT}`);
    
    // [FIX] Restored the full, unchanged cron job activation.
    setInterval(runScheduledTasks, CHECK_INTERVAL_MINUTES * 60 * 1000);
    runScheduledTasks();

    // Start the crypto deposit monitoring services
    startTransactionListener();
    startConfirmationService();
});