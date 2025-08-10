const axios = require('axios');
const { BOT_API_KEY, BACKEND_API_URL } = process.env;

if (!BOT_API_KEY || !BACKEND_API_URL) {
    console.error("FATAL: BOT_API_KEY or BACKEND_API_URL is not defined in .env file for the bot's apiClient.");
    process.exit(1);
}

const apiClient = axios.create({
    baseURL: `${BACKEND_API_URL}/api`,
    headers: {
        'Content-Type': 'application/json',
        'X-API-Key': BOT_API_KEY
    }
});

module.exports = { apiClient };
