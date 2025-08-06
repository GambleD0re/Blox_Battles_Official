// backend/database/database.js
const { Pool } = require('pg');

// The DATABASE_URL environment variable will be provided by Render.
// It includes the username, password, host, port, and database name.
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
    throw new Error('FATAL: DATABASE_URL environment variable is not set. The application cannot start.');
}

// Create a new connection pool. The pool will manage client connections.
// For Render's PostgreSQL, SSL is required and is enabled by default
// for connections outside of Render's private network.
const pool = new Pool({
    connectionString,
    // Render requires SSL for external connections and provides the necessary CA.
    // Setting rejectUnauthorized to false is a common practice for development
    // but for production, you might want to configure this more securely if needed.
    // However, for Render's managed service, this is standard.
    ssl: {
        rejectUnauthorized: false
    }
});

pool.on('connect', () => {
    console.log('Successfully connected to the PostgreSQL database pool.');
});

pool.on('error', (err, client) => {
    console.error('Unexpected error on idle PostgreSQL client', err);
    process.exit(-1);
});

// We will export a generic query function and a function to get the pool for transactions.
module.exports = {
    // This query function gets a client from the pool, runs the query, and releases the client.
    query: (text, params) => pool.query(text, params),
    // This function exposes the pool itself, which is necessary for managing transactions.
    getPool: () => pool
};
