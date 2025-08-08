// discord-bot/utils/statusUpdater.js
const { apiClient } = require('./apiClient');
const {
    NA_EAST_VC_ID, NA_WEST_VC_ID, EUROPE_VC_ID, OCE_VC_ID,
    MEMBERS_VC_ID, PLAYERS_VC_ID
} = process.env;

const STATS_UPDATE_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes
const STATUS_UPDATE_INTERVAL_MS = 60 * 1000; // 1 minute

const REGION_CHANNELS = {
    'NA-East': { id: NA_EAST_VC_ID, name: 'NA-East' },
    'NA-West': { id: NA_WEST_VC_ID, name: 'NA-West' },
    'EU': { id: EUROPE_VC_ID, name: 'Europe' },
    'OCE': { id: OCE_VC_ID, name: 'Oceania' }
};

async function updateServerStatus(client) {
    try {
        const response = await apiClient.get('/status');
        const activeRegions = new Set(response.data.map(server => server.region));
        for (const [regionKey, channelInfo] of Object.entries(REGION_CHANNELS)) {
            if (!channelInfo.id) continue;
            const isOnline = activeRegions.has(regionKey);
            const newName = `${channelInfo.name}: ${isOnline ? '🟢' : '🔴'}`;
            const channel = await client.channels.fetch(channelInfo.id).catch(() => null);
            if (channel && channel.name !== newName) {
                await channel.setName(newName).catch(err => console.warn(`[Status] Failed to update channel name for ${channelInfo.name}: ${err.message}`));
            }
        }
    } catch (apiError) {
        console.error(`[Status] Error fetching server status from backend: ${apiError.message}`);
    }
}

async function updateStatChannels(client) {
    if (!MEMBERS_VC_ID && !PLAYERS_VC_ID) return;
    try {
        const guild = client.guilds.cache.first();
        if (!guild) return;

        if (MEMBERS_VC_ID) {
            await guild.members.fetch();
            const memberCount = guild.memberCount;
            const memberChannelName = `📈 Members: ${memberCount.toLocaleString()}`;
            const memberChannel = await client.channels.fetch(MEMBERS_VC_ID).catch(() => null);
            if (memberChannel && memberChannel.name !== memberChannelName) {
                await memberChannel.setName(memberChannelName).catch(err => console.warn(`[Status] Failed to update member count: ${err.message}`));
            }
        }

        if (PLAYERS_VC_ID) {
            const response = await apiClient.get('/status/player-count');
            const playerCount = response.data.playerCount || 0;
            const playerChannelName = `💻 Players: ${playerCount.toLocaleString()}`;
            const playerChannel = await client.channels.fetch(PLAYERS_VC_ID).catch(() => null);
            if (playerChannel && playerChannel.name !== playerChannelName) {
                await playerChannel.setName(playerChannelName).catch(err => console.warn(`[Status] Failed to update player count: ${err.message}`));
            }
        }
    } catch (err) {
        console.error(`[Status] Failed to update stat channels: ${err.message}`);
    }
}

function startStatusUpdaters(client) {
    console.log(`[Status] Status updaters started.`);
    // Run once on start, then set intervals
    updateServerStatus(client);
    updateStatChannels(client);
    setInterval(() => updateServerStatus(client), STATUS_UPDATE_INTERVAL_MS);
    setInterval(() => updateStatChannels(client), STATS_UPDATE_INTERVAL_MS);
}

module.exports = { startStatusUpdaters };
