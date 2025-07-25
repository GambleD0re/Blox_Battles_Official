// clearAllDuels.js

const path = require('path');
const sqlite3 = require('sqlite3').verbose();

// Path to your SQLite file — adjust if needed
const DB_PATH = path.resolve(__dirname, 'database/blox_battles.db');

function clearAllDuels() {
  const db = new sqlite3.Database(DB_PATH, sqlite3.OPEN_READWRITE, (err) => {
    if (err) {
      console.error(`❌ Could not open database at ${DB_PATH}:`, err.message);
      process.exit(1);
    }
  });

  db.serialize(() => {
    db.run(
      `DELETE FROM duels`,
      [],
      function (err) {
        if (err) {
          console.error('❌ Error clearing duels:', err.message);
        } else {
          console.log(`✅ Cleared ${this.changes} duel(s) from the database.`);
        }
      }
    );
  });

  db.close((err) => {
    if (err) {
      console.error('❌ Error closing database:', err.message);
    } else {
      console.log('✅ Database connection closed.');
    }
  });
}

clearAllDuels();
