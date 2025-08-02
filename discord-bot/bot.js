// discord-bot/bot.js
require('dotenv').config();
const axios = require('axios');
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

const client = new Client({
    intents: [GatewayIntentBits.Guilds]
});

// --- Helper function to build the duel result embed ---
const buildDuelResultEmbed = (taskPayload) => {
    const { duelId, winner, loser, wager, pot, mapName, finalScores, playerLoadouts } = taskPayload;
    
    const winnerLoadout = playerLoadouts?.[winner.username]?.join(', ') || 'N/A';
    const loserLoadout = playerLoadouts?.[loser.username]?.join(', ') || 'N/A';
    
    const embed = new EmbedBuilder()
        .setColor(0x3fb950) // Green
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

// --- Task Processing ---
async function processDiscordTasks() {
    console.log('Fetching general Discord tasks...');
    try {
        const response = await apiClient.get('/api/tasks/bot/discord');
        const tasks = response.data;

        if (tasks.length === 0) return;

        console.log(`Found ${tasks.length} tasks to process.`);
        const channel = await client.channels.fetch(DUEL_RESULTS_CHANNEL_ID);
        if (!channel) {
            console.error(`FATAL: Duel results channel with ID ${DUEL_RESULTS_CHANNEL_ID} not found.`);
            return;
        }

        for (const task of tasks) {
            if (task.task_type === 'POST_DUEL_RESULT_TO_DISCORD') {
                const messagePayload = buildDuelResultEmbed(task.payload);
                await channel.send(messagePayload);
                await apiClient.post(`/api/tasks/${task.id}/complete`);
                console.log(`Posted duel result for ID ${task.payload.duelId} and completed task ${task.id}.`);
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

// --- Stat Channel Update Function ---
async function updateStatChannels() {
    console.log('Updating stat channels...');
    if (!MEMBERS_VC_ID || !PLAYERS_VC_ID) {
        console.warn('Member or Player VC ID is not configured. Skipping stat update.');
        return;
    }

    try {
        const guild = client.guilds.cache.first();
        if (!guild) {
            console.error('Bot is not in any guild.');
            return;
        }

        // 1. Update Discord Member Count
        await guild.members.fetch(); // Ensure member cache is up-to-date
        const memberCount = guild.memberCount;
        const memberChannelName = `📈 Members: ${memberCount.toLocaleString()}`;
        
        const memberChannel = await client.channels.fetch(MEMBERS_VC_ID);
        if (memberChannel && memberChannel.name !== memberChannelName) {
            await memberChannel.setName(memberChannelName);
            console.log(`Updated member count channel to: ${memberChannelName}`);
        }

        // 2. Update Website Player Count
        const response = await apiClient.get('/api/status/player-count');
        const playerCount = response.data.playerCount || 0;
        const playerChannelName = `💻 Players: ${playerCount.toLocaleString()}`;
        
        const playerChannel = await client.channels.fetch(PLAYERS_VC_ID);
        if (playerChannel && playerChannel.name !== playerChannelName) {
            await playerChannel.setName(playerChannelName);
            console.log(`Updated player count channel to: ${playerChannelName}`);
        }

    } catch (err) {
        console.error(`Failed to update stat channels: ${err.message}`);
    }
}

// --- Bot Events ---
client.once('ready', () => {
    console.log(`Bot logged in as ${client.user.tag}!`);
    
    // Run all tasks on startup, then start intervals
    updateServerStatus();
    processDiscordTasks();
    updateStatChannels();

    setInterval(updateServerStatus, UPDATE_INTERVAL_MS);
    setInterval(processDiscordTasks, UPDATE_INTERVAL_MS);
    setInterval(updateStatChannels, STATS_UPDATE_INTERVAL_MS);
});

// --- Login & Validation ---
if (!DISCORD_BOT_TOKEN || !BOT_API_KEY) {
    console.error("FATAL: DISCORD_BOT_TOKEN or BOT_API_KEY is not defined in the .env file.");
    process.exit(1);
}
if (!DUEL_RESULTS_CHANNEL_ID) {
    console.warn("Warning: DUEL_RESULTS_CHANNEL_ID is not set. The bot will not be able to post duel results.");
}
client.login(DISCORD_BOT_TOKEN);
