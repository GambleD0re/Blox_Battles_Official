// backend/migrate-db.js
// This script safely adds new columns to the 'users' table for the admin dashboard features.
// It checks if columns exist before adding them, so it's safe to run multiple times.

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Define the path to the database file.
const dbPath = path.join(__dirname, 'database', 'blox_battles.db');

// Create a new database connection.
const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        return console.error('Error connecting to database:', err.message);
    }
    console.log('Successfully connected to the SQLite database for migration.');
});

// --- Migration Logic ---

// An array of columns to add. Each object contains the name and the full SQL definition.
const columnsToAdd = [
    { name: 'is_banned', definition: 'is_banned BOOLEAN DEFAULT FALSE' },
    { name: 'ban_expires_at', definition: 'ban_expires_at TIMESTAMP' },
    { name: 'ban_reason', definition: 'ban_reason TEXT' }
];

db.serialize(() => {
    // 1. Get the current table information for the 'users' table.
    db.all('PRAGMA table_info(users)', (err, existingColumns) => {
        if (err) {
            return console.error('Error fetching table info:', err.message);
        }

        // Create a simple list of existing column names for easy checking.
        const existingColumnNames = existingColumns.map(col => col.name);
        console.log('Existing columns found:', existingColumnNames.join(', '));

        // 2. Loop through the columns we want to add.
        columnsToAdd.forEach(column => {
            // 3. Check if the column already exists.
            if (existingColumnNames.includes(column.name)) {
                console.log(`Column "${column.name}" already exists. Skipping.`);
            } else {
                // 4. If it doesn't exist, add it.
                const sql = `ALTER TABLE users ADD COLUMN ${column.definition}`;
                console.log(`Adding column "${column.name}"...`);
                
                db.run(sql, (alterErr) => {
                    if (alterErr) {
                        return console.error(`Error adding column "${column.name}":`, alterErr.message);
                    }
                    console.log(`Successfully added column "${column.name}".`);
                });
            }
        });
    });
});

// Close the database connection when all operations are done.
db.close((err) => {
    if (err) {
        return console.error('Error closing the database:', err.message);
    }
    console.log('Migration script finished. Database connection closed.');
});
