-- This script defines the PostgreSQL-compatible structure of the database.

-- Drop tables if they exist to ensure a clean slate. The CASCADE keyword will also drop dependent objects.
DROP TABLE IF EXISTS users, duels, tasks, push_subscriptions, game_servers, disputes, gem_purchases, transaction_history, payout_requests, crypto_deposits, inbox_messages, tournaments, tournament_participants, tournament_matches CASCADE;

-- Create the 'users' table. 'SERIAL' is the PostgreSQL equivalent of AUTOINCREMENT.
-- 'UUID' is a better type for your unique 'id' column.
-- [MODIFIED] Added 'discord_id' and 'discord_username' columns for Discord account linking.
CREATE TABLE users (
    user_index SERIAL PRIMARY KEY,
    id UUID NOT NULL UNIQUE,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash TEXT,
    google_id VARCHAR(255) UNIQUE,
    discord_id VARCHAR(255) UNIQUE,
    discord_username VARCHAR(255),
    gems BIGINT DEFAULT 0,
    wins INTEGER DEFAULT 0,
    losses INTEGER DEFAULT 0,
    is_admin BOOLEAN DEFAULT FALSE,
    linked_roblox_id VARCHAR(255),
    linked_roblox_username VARCHAR(255) UNIQUE,
    verification_phrase TEXT,
    avatar_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    password_last_updated TIMESTAMP WITH TIME ZONE,
    push_notifications_enabled BOOLEAN DEFAULT TRUE,
    status VARCHAR(50) NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'banned', 'terminated')),
    ban_applied_at TIMESTAMP WITH TIME ZONE,
    ban_expires_at TIMESTAMP WITH TIME ZONE,
    ban_reason TEXT,
    crypto_deposit_address VARCHAR(255) UNIQUE
);

-- Use NUMERIC for financial values and JSONB for JSON data.
CREATE TABLE crypto_deposits (
    id SERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    tx_hash VARCHAR(255) NOT NULL UNIQUE,
    token_type VARCHAR(10) NOT NULL CHECK(token_type IN ('USDC', 'USDT', 'POL')),
    amount_crypto NUMERIC(20, 8) NOT NULL,
    gem_package_id TEXT,
    gem_amount BIGINT NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'confirmed', 'credited', 'failed')),
    block_number BIGINT,
    required_confirmations INTEGER DEFAULT 30,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    credited_at TIMESTAMP WITH TIME ZONE
);

CREATE TABLE gem_purchases (
    id SERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL,
    stripe_session_id VARCHAR(255) NOT NULL UNIQUE,
    gem_amount BIGINT NOT NULL,
    amount_paid INTEGER NOT NULL, -- In cents
    currency VARCHAR(10) NOT NULL,
    status VARCHAR(50) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE transaction_history (
    id SERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL CHECK(type IN ('deposit_stripe', 'deposit_crypto', 'withdrawal', 'duel_wager', 'duel_win', 'admin_adjustment', 'tournament_buy_in', 'tournament_prize', 'tournament_duel')),
    amount_gems BIGINT NOT NULL,
    description TEXT,
    reference_id TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE payout_requests (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE SET NULL,
    type VARCHAR(50) NOT NULL CHECK(type IN ('crypto')),
    provider VARCHAR(50) NOT NULL CHECK(provider IN ('direct_node')),
    provider_payout_id VARCHAR(255),
    amount_gems BIGINT NOT NULL,
    amount_usd NUMERIC NOT NULL,
    fee_usd NUMERIC NOT NULL,
    destination_address VARCHAR(255),
    status VARCHAR(50) NOT NULL DEFAULT 'awaiting_approval' CHECK(status IN ('awaiting_approval', 'approved', 'declined', 'processing', 'completed', 'failed', 'canceled_by_user')),
    decline_reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- [MODIFIED] Added 'discord_link_request' to the list of allowed message types.
CREATE TABLE inbox_messages (
    id SERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL CHECK(type IN ('withdrawal_update', 'admin_message', 'discord_link_request')),
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    reference_id TEXT,
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE duels (
    id SERIAL PRIMARY KEY,
    challenger_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    opponent_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    wager BIGINT NOT NULL,
    pot BIGINT DEFAULT 0,
    tax_collected BIGINT DEFAULT 0,
    banned_weapons JSONB,
    map TEXT,
    region TEXT,
    status VARCHAR(50) DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'started', 'in_progress', 'completed_unseen', 'under_review', 'completed', 'canceled', 'declined', 'cheater_forfeit')), -- [MODIFIED] Added 'in_progress' status
    winner_id UUID REFERENCES users(id) ON DELETE SET NULL,
    challenger_seen_result BOOLEAN DEFAULT FALSE,
    opponent_seen_result BOOLEAN DEFAULT FALSE,
    server_invite_link TEXT,
    assigned_server_id VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    accepted_at TIMESTAMP WITH TIME ZONE,
    started_at TIMESTAMP WITH TIME ZONE,
    result_posted_at TIMESTAMP WITH TIME ZONE,
    bot_duel_id VARCHAR(255) UNIQUE,
    transcript JSONB,
    player_loadouts JSONB -- [NEW] Column to store player weapon loadouts.
);

CREATE TABLE disputes (
    id SERIAL PRIMARY KEY,
    duel_id INTEGER NOT NULL REFERENCES duels(id) ON DELETE CASCADE,
    reporter_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reported_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    reason TEXT NOT NULL,
    has_video_evidence BOOLEAN DEFAULT FALSE,
    status VARCHAR(50) DEFAULT 'pending',
    resolution TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    resolved_at TIMESTAMP WITH TIME ZONE,
    admin_resolver_id UUID REFERENCES users(id) ON DELETE SET NULL
);

-- [NEW] Tournaments Table: Stores the main configuration for each tournament.
CREATE TABLE tournaments (
    id UUID PRIMARY KEY,
    name TEXT NOT NULL,
    region TEXT NOT NULL,
    buy_in_amount BIGINT NOT NULL,
    prize_pool_gems BIGINT NOT NULL,
    prize_distribution JSONB NOT NULL,
    rules JSONB NOT NULL,
    capacity INTEGER NOT NULL DEFAULT 40,
    registration_opens_at TIMESTAMP WITH TIME ZONE NOT NULL,
    starts_at TIMESTAMP WITH TIME ZONE NOT NULL,
    ends_at TIMESTAMP WITH TIME ZONE,
    status VARCHAR(50) NOT NULL DEFAULT 'scheduled' CHECK(status IN ('scheduled', 'registration_open', 'active', 'completed', 'dispute_period', 'finalized', 'canceled')),
    assigned_bot_id VARCHAR(255) NOT NULL,
    private_server_link TEXT NOT NULL,
    final_transcript JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- [NEW] Tournament Participants Table: Links users to the tournaments they've joined.
CREATE TABLE tournament_participants (
    id SERIAL PRIMARY KEY,
    tournament_id UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    placement INTEGER,
    registered_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(tournament_id, user_id)
);

-- [NEW] Tournament Matches Table: Represents each match in the tournament bracket.
CREATE TABLE tournament_matches (
    id SERIAL PRIMARY KEY,
    tournament_id UUID NOT NULL REFERENCES tournaments(id) ON DELETE CASCADE,
    duel_id INTEGER REFERENCES duels(id) ON DELETE SET NULL,
    round_number INTEGER NOT NULL,
    match_in_round INTEGER NOT NULL,
    player1_id UUID REFERENCES users(id) ON DELETE CASCADE,
    player2_id UUID REFERENCES users(id) ON DELETE CASCADE,
    winner_id UUID REFERENCES users(id) ON DELETE SET NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'active', 'completed'))
);


CREATE TABLE tasks (
    id SERIAL PRIMARY KEY,
    task_type VARCHAR(255) NOT NULL,
    payload JSONB,
    status VARCHAR(50) DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP WITH TIME ZONE
);

CREATE TABLE push_subscriptions (
    id SERIAL PRIMARY KEY,
    user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    subscription JSONB NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE game_servers (
    server_id VARCHAR(255) PRIMARY KEY,
    region VARCHAR(50) NOT NULL,
    join_link TEXT NOT NULL,
    player_count INTEGER NOT NULL DEFAULT 0,
    last_heartbeat TIMESTAMP WITH TIME ZONE NOT NULL
);
