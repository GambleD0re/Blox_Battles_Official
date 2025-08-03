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
