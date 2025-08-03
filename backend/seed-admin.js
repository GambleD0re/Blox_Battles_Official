// backend/seed-admin.js
// This script creates a default admin user if one doesn't already exist.

require('dotenv').config({ path: require('path').resolve(__dirname, './.env') });
const db = require('./database/database');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const ADMIN_EMAIL = 'scriptmail00@gmail.com';
const ADMIN_ROBLOX_USERNAME = 'bloxbattlesAdmin';
const ADMIN_PASSWORD = process.env.DEFAULT_ADMIN_PASSWORD;

if (!ADMIN_PASSWORD) {
    console.error('[SEED] ERROR: DEFAULT_ADMIN_PASSWORD environment variable not set. Cannot create admin user.');
    process.exit(1);
}

const createAdmin = async () => {
    const client = await db.getPool().connect();
    try {
        // Check if the admin user already exists
        const { rows } = await client.query('SELECT id FROM users WHERE email = $1', [ADMIN_EMAIL]);
        if (rows.length > 0) {
            console.log('[SEED] Admin user already exists. Skipping creation.');
            return;
        }

        console.log('[SEED] Admin user not found. Creating...');

        // Hash the password securely
        const hashedPassword = await bcrypt.hash(ADMIN_PASSWORD, 10);
        const newUserId = crypto.randomUUID();

        // [MODIFIED] Set is_admin and is_master_admin to TRUE
        const insertSql = `
            INSERT INTO users (id, email, password_hash, is_admin, is_master_admin, linked_roblox_username)
            VALUES ($1, $2, $3, TRUE, TRUE, $4)
        `;

        await client.query(insertSql, [newUserId, ADMIN_EMAIL, hashedPassword, ADMIN_ROBLOX_USERNAME]);

        console.log('[SEED] Successfully created master admin user:', ADMIN_EMAIL);

    } catch (error) {
        console.error('[SEED] A critical error occurred while creating the admin user:', error);
        throw error; // Throw error to ensure the process exits with a non-zero code
    } finally {
        client.release();
    }
};

// Run the seeding function
createAdmin()
    .then(() => {
        console.log('[SEED] Admin seed script finished successfully.');
        process.exit(0);
    })
    .catch(() => {
        process.exit(1);
    });
