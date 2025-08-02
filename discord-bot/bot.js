// discord-bot/bot.js
require('dotenv').config();
const axios = require('axios');
const { Client, GatewayIntentBits } = require('discord.js');

// --- Configuration ---
const {
    DISCORD_BOT_TOKEN,
    BACKEND_API_URL,
    UPDATE_INTERVAL_SECONDS,
    NA_EAST_VC_ID,
    NA_WEST_VC_ID,
    EUROPE_VC_ID,
    OCE_VC_ID
} = process.env;

const STATUS_API_ENDPOINT = `${BACKEND_API_URL}/api/status`;
const UPDATE_INTERVAL_MS = parseInt(UPDATE_INTERVAL_SECONDS, 10) * 1000 || 30000;

// Mapping of region names to their Discord Channel IDs and display names
const REGION_CHANNELS = {
    'NA-East': { id: NA_EAST_VC_ID, name: 'NA-East' },
    'NA-West': { id: NA_WEST_VC_ID, name: 'NA-West' },
    'EU':      { id: EUROPE_VC_ID,  name: 'Europe' },
    'OCE':     { id: OCE_VC_ID,     name: 'Oceania' }
};

// --- Discord Client Initialization ---
const client = new Client({
    intents: [GatewayIntentBits.Guilds] // Required to see server channels
});

/**
 * Fetches server status from the backend and updates Discord voice channel names.
 */
async function updateServerStatus() {
    console.log('Fetching server status from backend...');
    try {
        const response = await axios.get(STATUS_API_ENDPOINT);
        const onlineServers = response.data;
        const activeRegions = new Set(onlineServers.map(server => server.region));
        
        console.log('Active regions found:', Array.from(activeRegions));

        for (const [regionKey, channelInfo] of Object.entries(REGION_CHANNELS)) {
            if (!channelInfo.id) {
                console.warn(`Channel ID for region ${regionKey} is not configured. Skipping.`);
                continue;
            }

            const isOnline = activeRegions.has(regionKey);
            const newName = `${channelInfo.name}: ${isOnline ? '🟢' : '🔴'}`;

            try {
                const channel = await client.channels.fetch(channelInfo.id);
                if (channel) {
                    if (channel.name !== newName) {
                        await channel.setName(newName);
                        console.log(`Updated channel ${channelInfo.name} to: ${newName}`);
                    }
                } else {
                    console.error(`Could not find channel with ID ${channelInfo.id} for region ${regionKey}.`);
                }
            } catch (discordError) {
                console.error(`Failed to update channel for ${regionKey}. Error: ${discordError.message}`);
            }
        }
    } catch (apiError) {
        console.error(`Error fetching status from backend API: ${apiError.message}`);
        // If we can't reach the backend, assume all servers are down.
        for (const [regionKey, channelInfo] of Object.entries(REGION_CHANNELS)) {
             const newName = `${channelInfo.name}: 🔴`;
             try {
                const channel = await client.channels.fetch(channelInfo.id);
                if (channel && channel.name !== newName) {
                    await channel.setName(newName);
                    console.log(`API unreachable. Updated channel ${channelInfo.name} to offline status.`);
                }
             } catch (discordError) {
                console.error(`Failed to set channel ${regionKey} to offline. Error: ${discordError.message}`);
             }
        }
    }
}

// --- Bot Events ---
client.once('ready', () => {
    console.log(`Bot logged in as ${client.user.tag}!`);
    
    // Run immediately on startup, then start the interval
    updateServerStatus();
    setInterval(updateServerStatus, UPDATE_INTERVAL_MS);
});

// --- Login ---
if (!DISCORD_BOT_TOKEN) {
    console.error("FATAL: DISCORD_BOT_TOKEN is not defined in the .env file. Bot cannot start.");
    process.exit(1);
}
client.login(DISCORD_BOT_TOKEN);
