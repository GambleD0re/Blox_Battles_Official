// backend/server.js
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const passport = require('passport');
const cookieParser = require('cookie-parser');
const morgan = require('morgan');
const webpush = require('web-push');
const db = require('./database/database'); // This now imports the pg pool
const crypto = require('crypto');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const { botLogger } = require('./middleware/botLogger');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// Import the new services for crypto deposits
const { startTransactionListener } = require('./services/transactionListenerService');
const { startConfirmationService } = require('./services/transactionConfirmationService');

const app = express();
const PORT = process.env.PORT || 3001;

// --- Web Push Configuration ---
if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    webpush.setVapidDetails(
        'mailto:youremail@example.com', // Replace with your actual email
        process.env.VAPID_PUBLIC_KEY,
        process.env.VAPID_PRIVATE_KEY
    );
    console.log("Web Push configured successfully.");
} else {
    console.warn("VAPID keys not found in .env file. Push notifications will be disabled.");
}

// --- Middleware Setup ---
// IMPORTANT: Update this to use your production frontend URL from the environment variables
app.use(cors({ origin: process.env.SERVER_URL || 'http://localhost:3000', credentials: true }));
app.use(cookieParser());
app.use(passport.initialize());
app.use(morgan('dev'));

// --- Stripe Webhook Handler ---
// This needs to be defined BEFORE the global express.json() parser
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

        const pool = db.getPool();
        const client = await pool.connect();
        try {
            const { rows: existingRows } = await client.query('SELECT id FROM gem_purchases WHERE stripe_session_id = $1', [sessionId]);
            if (existingRows.length > 0) {
                console.log(`Webhook Info: Received duplicate event for session ${sessionId}. Ignoring.`);
                return res.status(200).json({ received: true, message: 'Duplicate event.' });
            }

            await client.query('BEGIN');
            await client.query('UPDATE users SET gems = gems + $1 WHERE id = $2', [gemAmountInt, userId]);
            await client.query(
                'INSERT INTO gem_purchases (user_id, stripe_session_id, gem_amount, amount_paid, currency, status) VALUES ($1, $2, $3, $4, $5, $6)',
                [userId, sessionId, gemAmountInt, amountPaid, currency, 'completed']
            );
            await client.query(
                'INSERT INTO transaction_history (user_id, type, amount_gems, description) VALUES ($1, $2, $3, $4)',
                [userId, 'deposit_stripe', gemAmountInt, `${gemAmountInt} Gems purchased via Card`]
            );
            await client.query('COMMIT');

            console.log(`Gems awarded successfully for session ${sessionId}. User: ${userId}, Gems: ${gemAmount}`);
        } catch (dbError) {
            await client.query('ROLLBACK');
            console.error(`DATABASE ERROR during webhook processing for session ${sessionId}:`, dbError.message);
            return res.status(500).json({ error: 'Database processing failed.' });
        } finally {
            client.release();
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
    // IMPORTANT: The callbackURL needs to be an absolute path for production
    callbackURL: `${process.env.SERVER_URL || `http://localhost:${PORT}`}/api/auth/google/callback`
  },
  async function(accessToken, refreshToken, profile, done) {
    const googleId = profile.id;
    const email = profile.emails[0].value;
    try {
        let userResult = await db.query('SELECT * FROM users WHERE google_id = $1', [googleId]);
        let user = userResult.rows[0];
        if (user) { return done(null, user); }

        userResult = await db.query('SELECT * FROM users WHERE email = $1', [email]);
        user = userResult.rows[0];
        if (user) {
            await db.query('UPDATE users SET google_id = $1 WHERE id = $2', [googleId, user.id]);
            const updatedUserResult = await db.query('SELECT * FROM users WHERE id = $1', [user.id]);
            return done(null, updatedUserResult.rows[0]);
        }
        
        const newUserId = crypto.randomUUID();
        await db.query('INSERT INTO users (id, google_id, email) VALUES ($1, $2, $3)', [newUserId, googleId, email]);
        const newUserResult = await db.query('SELECT * FROM users WHERE id = $1', [newUserId]);
        return done(null, newUserResult.rows[0]);
    } catch (err) {
      console.error("Google Strategy Error:", err);
      return done(err);
    }
  }
));

// --- Scheduled Task (To be moved to a Render Cron Job) ---
// We will leave this here for now but plan to disable it and use a separate service.
const DUEL_EXPIRATION_HOURS = 1;
const DUEL_FORFEIT_MINUTES = 10;
const CHECK_INTERVAL_MINUTES = 1;

async function runScheduledTasks() {
    console.log(`[CRON] Running scheduled tasks at ${new Date().toISOString()}`);
    const pool = db.getPool();
    
    // Task 1: Cancel old 'accepted' duels
    const client1 = await pool.connect();
    try {
        const acceptedSql = `
            SELECT id, challenger_id, opponent_id, pot 
            FROM duels 
            WHERE status = 'accepted' AND accepted_at <= NOW() - INTERVAL '${DUEL_EXPIRATION_HOURS} hours'
        `;
        const { rows: expiredAcceptedDuels } = await client1.query(acceptedSql);
        for (const duel of expiredAcceptedDuels) {
            await client1.query('BEGIN');
            const refundAmount = duel.pot / 2;
            await client1.query('UPDATE users SET gems = gems + $1 WHERE id = $2', [refundAmount, duel.challenger_id]);
            await client1.query('UPDATE users SET gems = gems + $1 WHERE id = $2', [refundAmount, duel.opponent_id]);
            await client1.query("UPDATE duels SET status = 'canceled' WHERE id = $1", [duel.id]);
            await client1.query('COMMIT');
            console.log(`[CRON] Canceled expired 'accepted' duel ID ${duel.id}. Pot of ${duel.pot} refunded.`);
        }
    } catch (error) {
        console.error('[CRON] Error canceling old accepted duels:', error);
        await client1.query('ROLLBACK').catch(console.error);
    } finally {
        client1.release();
    }

    // Task 2: Handle 'started' duels (forfeit logic)
    const client2 = await pool.connect();
    try {
        const startedSql = `
            SELECT id, challenger_id, opponent_id, pot, transcript 
            FROM duels 
            WHERE status = 'started' AND started_at <= NOW() - INTERVAL '${DUEL_FORFEIT_MINUTES} minutes'
        `;
        const { rows: expiredStartedDuels } = await client2.query(startedSql);

        for (const duel of expiredStartedDuels) {
            try {
                await client2.query('BEGIN');
                const { rows: [challenger] } = await client2.query('SELECT id, linked_roblox_username FROM users WHERE id = $1', [duel.challenger_id]);
                const { rows: [opponent] } = await client2.query('SELECT id, linked_roblox_username FROM users WHERE id = $1', [duel.opponent_id]);

                const transcript = duel.transcript || [];
                const joinedPlayers = new Set(
                    transcript.filter(event => event.eventType === 'PLAYER_JOINED_DUEL' && event.data?.playerName).map(event => event.data.playerName)
                );
                
                const challengerJoined = joinedPlayers.has(challenger.linked_roblox_username);
                const opponentJoined = joinedPlayers.has(opponent.linked_roblox_username);
                
                if (!challengerJoined && !opponentJoined) {
                    const refundAmount = duel.pot / 2;
                    await client2.query('UPDATE users SET gems = gems + $1 WHERE id = $2', [refundAmount, duel.challenger_id]);
                    await client2.query('UPDATE users SET gems = gems + $1 WHERE id = $2', [refundAmount, duel.opponent_id]);
                    await client2.query("UPDATE duels SET status = 'canceled', winner_id = NULL WHERE id = $1", [duel.id]);
                    console.log(`[CRON] Duel ID ${duel.id} canceled (no-show from both). Pot of ${duel.pot} refunded.`);
                } else if (challengerJoined && !opponentJoined) {
                    await client2.query('UPDATE users SET gems = gems + $1, wins = wins + 1 WHERE id = $2', [duel.pot, duel.challenger_id]);
                    await client2.query('UPDATE users SET losses = losses + 1 WHERE id = $1', [duel.opponent_id]);
                    await client2.query("UPDATE duels SET status = 'completed', winner_id = $1 WHERE id = $2", [duel.challenger_id, duel.id]);
                    console.log(`[CRON] Duel ID ${duel.id} forfeited by ${opponent.linked_roblox_username}.`);
                } else if (!challengerJoined && opponentJoined) {
                    await client2.query('UPDATE users SET gems = gems + $1, wins = wins + 1 WHERE id = $2', [duel.pot, duel.opponent_id]);
                    await client2.query('UPDATE users SET losses = losses + 1 WHERE id = $1', [duel.challenger_id]);
                    await client2.query("UPDATE duels SET status = 'completed', winner_id = $1 WHERE id = $2", [duel.opponent_id, duel.id]);
                    console.log(`[CRON] Duel ID ${duel.id} forfeited by ${challenger.linked_roblox_username}.`);
                } else {
                    console.log(`[CRON] Duel ID ${duel.id} is still considered active. No action taken.`);
                }
                
                await client2.query('COMMIT');
            } catch (err) {
                await client2.query('ROLLBACK');
                console.error(`[CRON] Error processing forfeit for duel ID ${duel.id}:`, err);
            }
        }
    } catch (error) {
        console.error('[CRON] Error fetching or processing no-show forfeits:', error);
    } finally {
        client2.release();
    }
}

// --- API Routes ---
const apiRoutes = require('./routes');
app.use('/api', botLogger, apiRoutes);

// --- Server Startup ---
app.listen(PORT, () => {
    console.log(`Backend API server listening on http://localhost:${PORT}`);
    
    // This setInterval will be replaced by a Render Cron Job.
    // It is safe to comment this out or remove it once the Cron Job is configured on Render.
    setInterval(runScheduledTasks, CHECK_INTERVAL_MINUTES * 60 * 1000);
    runScheduledTasks();

    // Start the crypto deposit monitoring services
    startTransactionListener();
    startConfirmationService();
});
