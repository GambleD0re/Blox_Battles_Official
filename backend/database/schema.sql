-- This script defines the complete and final structure of the database.
-- It includes all tables and columns needed for the Blox Battles application.

-- Drop tables if they exist to ensure a clean slate.
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS duels;
DROP TABLE IF EXISTS tasks;
DROP TABLE IF EXISTS push_subscriptions;
DROP TABLE IF EXISTS region_servers;
DROP TABLE IF EXISTS disputes;
DROP TABLE IF EXISTS transactions;
DROP TABLE IF EXISTS gem_purchases;
DROP TABLE IF EXISTS transaction_history;
DROP TABLE IF EXISTS payout_requests;
DROP TABLE IF EXISTS crypto_deposits;
DROP TABLE IF EXISTS inbox_messages;

-- Create the 'users' table with all necessary columns.
-- [MODIFIED] The user status system has been overhauled for the ban/appeals feature.
CREATE TABLE IF NOT EXISTS users (
    user_index INTEGER PRIMARY KEY AUTOINCREMENT,
    id TEXT NOT NULL UNIQUE,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT,
    google_id TEXT UNIQUE,
    gems INTEGER DEFAULT 0,
    wins INTEGER DEFAULT 0,
    losses INTEGER DEFAULT 0,
    is_admin BOOLEAN DEFAULT TRUE,
    linked_roblox_id TEXT,
    linked_roblox_username TEXT UNIQUE,
    verification_phrase TEXT,
    avatar_url TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    password_last_updated TIMESTAMP,
    push_notifications_enabled BOOLEAN DEFAULT TRUE,
    -- [REMOVED] The 'is_banned' column is now replaced by the 'status' column.
    -- [NEW] A more descriptive status for user accounts.
    status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'banned', 'terminated')),
    ban_applied_at TIMESTAMP, -- [NEW] Timestamp for when the ban was issued.
    ban_expires_at TIMESTAMP,
    ban_reason TEXT,
    crypto_deposit_address TEXT UNIQUE
);

-- Create the 'crypto_deposits' table to track incoming transactions.
CREATE TABLE IF NOT EXISTS crypto_deposits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    tx_hash TEXT NOT NULL UNIQUE,
    token_type TEXT NOT NULL CHECK(token_type IN ('USDC', 'USDT', 'POL')),
    amount_crypto REAL NOT NULL,
    gem_package_id TEXT NOT NULL,
    gem_amount INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'confirmed', 'credited', 'failed')),
    block_number INTEGER,
    required_confirmations INTEGER DEFAULT 30,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    credited_at TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);


-- Create the 'gem_purchases' table (formerly transactions)
CREATE TABLE IF NOT EXISTS gem_purchases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    stripe_session_id TEXT NOT NULL UNIQUE,
    gem_amount INTEGER NOT NULL,
    amount_paid INTEGER NOT NULL, -- In cents
    currency TEXT NOT NULL,
    status TEXT NOT NULL, -- e.g., 'completed'
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL
);

-- Create the 'transaction_history' table for a unified user-facing log.
CREATE TABLE IF NOT EXISTS transaction_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('deposit_stripe', 'deposit_crypto', 'withdrawal', 'duel_wager', 'duel_win', 'admin_adjustment')),
    amount_gems INTEGER NOT NULL, -- Can be positive or negative
    description TEXT,
    reference_id TEXT, -- e.g., duel_id, payout_request_id
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

-- Create the 'payout_requests' table for an audit trail of all withdrawals.
CREATE TABLE IF NOT EXISTS payout_requests (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('crypto')),
    provider TEXT NOT NULL CHECK(provider IN ('direct_node')),
    provider_payout_id TEXT,
    amount_gems INTEGER NOT NULL,
    amount_usd REAL NOT NULL,
    fee_usd REAL NOT NULL,
    destination_address TEXT,
    status TEXT NOT NULL DEFAULT 'awaiting_approval' CHECK(status IN ('awaiting_approval', 'approved', 'declined', 'processing', 'completed', 'failed', 'canceled_by_user')),
    decline_reason TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL
);

-- Create the 'inbox_messages' table for user notifications about withdrawals.
CREATE TABLE IF NOT EXISTS inbox_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('withdrawal_update', 'admin_message')),
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    reference_id TEXT,
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);


-- Create the 'duels' table.
CREATE TABLE IF NOT EXISTS duels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    challenger_id TEXT NOT NULL,
    opponent_id TEXT NOT NULL,
    wager INTEGER NOT NULL,
    pot INTEGER DEFAULT 0,
    tax_collected INTEGER DEFAULT 0,
    banned_weapons TEXT,
    map TEXT,
    region TEXT, 
    status TEXT DEFAULT 'pending',
    winner_id TEXT,
    challenger_seen_result BOOLEAN DEFAULT FALSE,
    opponent_seen_result BOOLEAN DEFAULT FALSE,
    server_invite_link TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    accepted_at TIMESTAMP,
    started_at TIMESTAMP, 
    bot_duel_id TEXT UNIQUE, 
    transcript TEXT, 
    FOREIGN KEY (challenger_id) REFERENCES users (id) ON DELETE CASCADE,
    FOREIGN KEY (opponent_id) REFERENCES users (id) ON DELETE CASCADE,
    FOREIGN KEY (winner_id) REFERENCES users (id) ON DELETE SET NULL
);

-- Create the 'disputes' table to manage player reports.
CREATE TABLE IF NOT EXISTS disputes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    duel_id INTEGER NOT NULL,
    reporter_id TEXT NOT NULL,
    reported_id TEXT NOT NULL,
    reason TEXT NOT NULL,
    has_video_evidence BOOLEAN DEFAULT FALSE,
    status TEXT DEFAULT 'pending',
    resolution TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    resolved_at TIMESTAMP,
    admin_resolver_id TEXT,
    FOREIGN KEY (duel_id) REFERENCES duels (id) ON DELETE CASCADE,
    FOREIGN KEY (reporter_id) REFERENCES users (id) ON DELETE CASCADE,
    FOREIGN KEY (reported_id) REFERENCES users (id) ON DELETE CASCADE,
    FOREIGN KEY (admin_resolver_id) REFERENCES users (id) ON DELETE SET NULL
);

-- Create the 'tasks' table.
CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_type TEXT NOT NULL,
    payload TEXT,
    status TEXT DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP
);

-- Create the 'push_subscriptions' table.
CREATE TABLE IF NOT EXISTS push_subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL UNIQUE,
    subscription TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

-- Create the 'region_servers' table for admins to manage.
CREATE TABLE IF NOT EXISTS region_servers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    region TEXT NOT NULL CHECK(region IN ('Oceania', 'North America', 'Europe')),
    server_link TEXT NOT NULL UNIQUE,
    is_active BOOLEAN DEFAULT TRUE,
    last_used TIMESTAMP
);