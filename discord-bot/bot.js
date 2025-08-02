// discord-bot/bot.js
require('dotenv').config();
const axios = require('axios');
// [MODIFIED] Added GatewayIntentBits.GuildMembers
const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

// --- Configuration ---
const {
    DISCORD_BOT_TOKEN,
    BOT_API_KEY,
    BACKEND_API_URL,
    FRONTEND_URL,
    UPDATE_INTERVAL_SECONDS,
    DUEL_RESULTS_CHANNEL_ID,
    NA_EAST_VC_ID,
    NA_WEST_VC_ID,
    EUROPE_VC_ID,
    OCE_VC_ID,
    MEMBERS_VC_ID,
    PLAYERS_VC_ID
} = process.env;

const UPDATE_INTERVAL_MS = parseInt(UPDATE_INTERVAL_SECONDS, 10) * 1000 || 15000;
const STATS_UPDATE_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes

const apiClient = axios.create({
    baseURL: BACKEND_API_URL,
    headers: { 'X-API-Key': BOT_API_KEY }
});

const REGION_CHANNELS = {
    'NA-East': { id: NA_EAST_VC_ID, name: 'NA-East' },
    'NA-West': { id: NA_WEST_VC_ID, name: 'NA-West' },
    'EU':      { id: EUROPE_VC_ID,  name: 'Europe' },
    'OCE':     { id: OCE_VC_ID,     name: 'Oceania' }
};

// [MODIFIED] Add the GuildMembers intent to allow the bot to see all server members.
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers 
    ]
});

const buildDuelResultEmbed = (taskPayload) => {
    const { duelId, winner, loser, wager, pot, mapName, finalScores, playerLoadouts } = taskPayload;
    
    const winnerLoadout = playerLoadouts?.[winner.username]?.join(', ') || 'N/A';
    const loserLoadout = playerLoadouts?.[loser.username]?.join(', ') || 'N/A';
    
    const embed = new EmbedBuilder()
        .setColor(0x3fb950)
        .setTitle(`⚔️ Duel Result: ${winner.username} vs. ${loser.username}`)
        .setURL(`${FRONTEND_URL}/transcripts/${duelId}`)
        .setThumbnail(winner.avatarUrl || `https://www.roblox.com/headshot-thumbnail/image?userId=${winner.robloxId}&width=150&height=150&format=png`)
        .addFields(
            { name: '🏆 Winner', value: `**${winner.username}**\n💰 **+${pot.toLocaleString()}** Gems`, inline: true },
            { name: '💔 Loser', value: `**${loser.username}**\n💸 **-${wager.toLocaleString()}** Gems`, inline: true },
            { name: '📊 Score & Map', value: `\`${finalScores ? Object.values(finalScores).join(' - ') : 'N/A'}\` on **${mapName}**`, inline: false },
            { name: `${winner.username}'s Loadout`, value: `\`\`\`${winnerLoadout}\`\`\``, inline: true },
            { name: `${loser.username}'s Loadout`, value: `\`\`\`${loserLoadout}\`\`\``, inline: true }
        )
        .setTimestamp()
        .setFooter({ text: `Duel ID: ${duelId}` });

    const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setLabel('View Full Transcript')
                .setStyle(ButtonStyle.Link)
                .setURL(`${FRONTEND_URL}/transcripts/${duelId}`)
        );

    return { embeds: [embed], components: [row] };
};

async function processDiscordTasks() {
    console.log('Fetching general Discord tasks...');
    try {
        const response = await apiClient.get('/api/tasks/bot/discord');
        const tasks = response.data;
        if (tasks.length === 0) return;
        const channel = await client.channels.fetch(DUEL_RESULTS_CHANNEL_ID);
        if (!channel) return;
        for (const task of tasks) {
            if (task.task_type === 'POST_DUEL_RESULT_TO_DISCORD') {
                const messagePayload = buildDuelResultEmbed(task.payload);
                await channel.send(messagePayload);
                await apiClient.post(`/api/tasks/${task.id}/complete`);
            }
        }
    } catch (err) {
        console.error(`Error processing Discord tasks: ${err.message}`);
    }
}

async function updateServerStatus() {
    console.log('Fetching server status from backend...');
    try {
        const response = await apiClient.get('/api/status');
        const activeRegions = new Set(response.data.map(server => server.region));
        for (const [regionKey, channelInfo] of Object.entries(REGION_CHANNELS)) {
            const isOnline = activeRegions.has(regionKey);
            const newName = `${channelInfo.name}: ${isOnline ? '🟢' : '🔴'}`;
            const channel = await client.channels.fetch(channelInfo.id).catch(() => null);
            if (channel && channel.name !== newName) {
                await channel.setName(newName);
            }
        }
    } catch (apiError) {
        console.error(`Error fetching status from backend API: ${apiError.message}`);
    }
}

async function updateStatChannels() {
    console.log('Updating stat channels...');
    if (!MEMBERS_VC_ID || !PLAYERS_VC_ID) return;
    try {
        const guild = client.guilds.cache.first();
        if (!guild) return;
        
        await guild.fetch(); // Ensure guild data is fresh
        const memberCount = guild.memberCount;
        const memberChannelName = `📈 Members: ${memberCount.toLocaleString()}`;
        const memberChannel = await client.channels.fetch(MEMBERS_VC_ID).catch(() => null);
        if (memberChannel && memberChannel.name !== memberChannelName) {
            await memberChannel.setName(memberChannelName);
        }

        const response = await apiClient.get('/api/status/player-count');
        const playerCount = response.data.playerCount || 0;
        const playerChannelName = `💻 Players: ${playerCount.toLocaleString()}`;
        const playerChannel = await client.channels.fetch(PLAYERS_VC_ID).catch(() => null);
        if (playerChannel && playerChannel.name !== playerChannelName) {
            await playerChannel.setName(playerChannelName);
        }
    } catch (err) {
        console.error(`Failed to update stat channels: ${err.message}`);
    }
}

client.once('ready', () => {
    console.log(`Bot logged in as ${client.user.tag}!`);
    updateServerStatus();
    processDiscordTasks();
    updateStatChannels();
    setInterval(updateServerStatus, UPDATE_INTERVAL_MS);
    setInterval(processDiscordTasks, UPDATE_INTERVAL_MS);
    setInterval(updateStatChannels, STATS_UPDATE_INTERVAL_MS);
});

if (!DISCORD_BOT_TOKEN || !BOT_API_KEY) {
    console.error("FATAL: DISCORD_BOT_TOKEN or BOT_API_KEY is not defined.");
    process.exit(1);
}
client.login(DISCORD_BOT_TOKEN);
