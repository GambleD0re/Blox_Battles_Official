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
    OCE_VC_ID
} = process.env;

const UPDATE_INTERVAL_MS = parseInt(UPDATE_INTERVAL_SECONDS, 10) * 1000 || 15000;

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

// --- Discord Client Initialization ---
const client = new Client({
    intents: [GatewayIntentBits.Guilds]
});

// --- [NEW] Helper function to build the duel result embed ---
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
    // ... (This function remains unchanged)
}

// --- Bot Events ---
client.once('ready', () => {
    console.log(`Bot logged in as ${client.user.tag}!`);
    
    // Run all tasks on startup, then start intervals
    updateServerStatus();
    processDiscordTasks();

    setInterval(updateServerStatus, UPDATE_INTERVAL_MS);
    setInterval(processDiscordTasks, UPDATE_INTERVAL_MS); // Use the same interval
});

// --- Login & Validation ---
if (!DISCORD_BOT_TOKEN) {
    console.error("FATAL: DISCORD_BOT_TOKEN is not defined in the .env file.");
    process.exit(1);
}
if (!BOT_API_KEY) {
    console.error("FATAL: BOT_API_KEY is not defined in the .env file.");
    process.exit(1);
}
if (!DUEL_RESULTS_CHANNEL_ID) {
    console.warn("Warning: DUEL_RESULTS_CHANNEL_ID is not set. The bot will not be able to post duel results.");
}
client.login(DISCORD_BOT_TOKEN);```

This completes the entire feature. Once you deploy these changes and configure the new environment variables, the system will be fully capable of capturing duel results, including player loadouts, and automatically posting them as stylish, informative cards in your Discord server.
