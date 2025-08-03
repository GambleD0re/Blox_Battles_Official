#!/bin/bash
# Exit immediately if a command exits with a non-zero status.
set -e

# This script will run the schema.sql file against the database.
# The DATABASE_URL environment variable is automatically provided by Render.

echo "--- Running Database Schema Setup ---"

# Use psql to execute the schema.sql file.
# -X: Do not read psqlrc startup file.
# -f: Specifies the file to execute.
# --quiet: Suppresses informational messages.
# --single-transaction: Wraps the entire script in a single transaction.
#                       If any command fails, the entire transaction is rolled back.
psql $DATABASE_URL -X -f ./database/schema.sql --quiet --single-transaction

echo "--- Database Schema Setup Complete ---"

echo "--- Seeding Initial Platform Status ---"

# Seed the platform_status table with default values for all features.
psql $DATABASE_URL --quiet <<-EOSQL
    INSERT INTO platform_status (feature_key, is_enabled, disabled_title, disabled_message) VALUES
    ('dueling', TRUE, 'Dueling Unavailable', 'Dueling is temporarily disabled while we perform maintenance. Please check back later.'),
    ('discord_dueling', TRUE, 'Discord Dueling Unavailable', 'Challenging other players via Discord is temporarily disabled.'),
    ('withdrawals', TRUE, 'Withdrawals Unavailable', 'Withdrawals are temporarily disabled for maintenance. Your funds are safe.'),
    ('deposits_card', TRUE, 'Card Deposits Unavailable', 'Credit and debit card deposits are temporarily offline.'),
    ('deposits_crypto', TRUE, 'Crypto Deposits Unavailable', 'Cryptocurrency deposits are temporarily offline.'),
    ('tournaments', TRUE, 'Tournaments Unavailable', 'The tournament system is currently offline for scheduled updates.'),
    ('roblox_linking', TRUE, 'Account Linking Unavailable', 'Linking new Roblox accounts is temporarily disabled.')
    ON CONFLICT (feature_key) DO NOTHING;
EOSQL

echo "--- Platform Status Seeding Complete ---"
