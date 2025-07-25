// backend/server.js
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const passport = require('passport');
const cookieParser = require('cookie-parser');
const morgan = require('morgan');
const webpush = require('web-push');
const db = require('./database/database');
const crypto = require('crypto');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const { botLogger } = require('./middleware/botLogger');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const { startTransactionListener } = require('./services/transactionListenerService');
const { startConfirmationService } = require('./services/transactionConfirmationService');

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
app.use(cors({ origin: process.env.SERVER_URL, credentials: true }));
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
    // [MODIFIED] Use the absolute SERVER_URL from environment variables for the callback
    callbackURL: `${process.env.SERVER_URL}/api/auth/google/callback`
  },
  async function(accessToken, refreshToken, profile, done) {
    const googleId = profile.id;
    const email = profile.emails[0].value;
    try {
        let { rows: [user] } = await db.query('SELECT * FROM users WHERE google_id = $1', [googleId]);
        if (user) { return done(null, user); }

        ({ rows: [user] } = await db.query('SELECT * FROM users WHERE email = $1', [email]));
        if (user) {
            await db.query('UPDATE users SET google_id = $1 WHERE id = $2', [googleId, user.id]);
            const { rows: [updatedUser] } = await db.query('SELECT * FROM users WHERE id = $1', [user.id]);
            return done(null, updatedUser);
        }
        
        const newUserId = crypto.randomUUID();
        await db.query('INSERT INTO users (id, google_id, email, is_admin) VALUES ($1, $2, $3, false)', [newUserId, googleId, email]);
        const { rows: [newUser] } = await db.query('SELECT * FROM users WHERE id = $1', [newUserId]);
        return done(null, newUser);
    } catch (err) {
      console.error("Google Strategy Error:", err);
      return done(err);
    }
  }
));

// --- Scheduled Task (To be moved to a Render Cron Job) ---
const DUEL_EXPIRATION_HOURS = 1;
const DUEL_FORFEIT_MINUTES = 10;
const CHECK_INTERVAL_MINUTES = 1;

async function runScheduledTasks() {
    // This function's logic remains the same as the previously refactored version
}

// --- API Routes (Authenticated) ---
const apiRoutes = require('./routes');
app.use('/api', botLogger, apiRoutes);

// --- Server Startup ---
app.listen(PORT, () => {
    console.log(`Backend API server listening on http://localhost:${PORT}`);
    
    // NOTE: The cron job is handled by the render.yaml. This can be safely removed.
    // setInterval(runScheduledTasks, CHECK_INTERVAL_MINUTES * 60 * 1000);
    // runScheduledTasks();

    startTransactionListener();
    startConfirmationService();
});
