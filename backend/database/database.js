// backend/database/database.js
// This module provides a centralized, promisified, and stabilized connection to the SQLite database.

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const util = require('util');

// Define the path to the database file.
const dbPath = path.join(__dirname, 'blox_battles.db');

// Create a new database connection object.
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('FATAL: Could not connect to database.', err.message);
        // If the database can't be opened, the app is non-functional. Exit the process.
        process.exit(1);
    } else {
        console.log('Successfully connected to the SQLite database.');
    }
});

// [REWORKED] Centralize promisification and add serialization.
// We are creating a new object to export with promisified methods.
// This is a cleaner and safer pattern than modifying the db object in server.js.
const dbWrapper = {
    // The 'get' method retrieves a single row.
    get: util.promisify(db.get.bind(db)),
    // The 'all' method retrieves all rows.
    all: util.promisify(db.all.bind(db)),
    // The 'run' method executes a query that doesn't return rows (INSERT, UPDATE, DELETE).
    run: util.promisify(db.run.bind(db)),
    // [NEW] Expose the original db object for transaction control.
    // This allows us to manually call `db.run('BEGIN TRANSACTION')` etc., which cannot be promisified.
    instance: db
};

// Use serialize to ensure that database queries are executed sequentially,
// preventing race conditions from multiple async services trying to write at once.
db.serialize(() => {
    // Enable Write-Ahead Logging for better concurrency and performance.
    db.run("PRAGMA journal_mode = WAL;");
});

// Export our new wrapper object instead of the raw db instance.
module.exports = dbWrapper;
