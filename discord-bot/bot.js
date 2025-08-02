// discord-bot/bot.js
require('dotenv').config();
const axios = require('axios');
const {
    Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder,
    ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder,
    TextInputStyle, InteractionType, MessageFlags
} = require('discord.js');

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
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers 
    ]
});

// Command and Modal Interaction Handler
client.on('interactionCreate', async interaction => {
    if (interaction.isChatInputCommand()) {
        const { commandName } = interaction;
        if (commandName === 'link') {
            const modal = new ModalBuilder().setCustomId('linkAccountModal').setTitle('Link Your Blox Battles Account');
            const usernameInput = new TextInputBuilder().setCustomId('robloxUsernameInput').setLabel("Your Blox Battles (Roblox) Username").setStyle(TextInputStyle.Short).setPlaceholder('Enter your exact Roblox username').setRequired(true);
            const actionRow = new ActionRowBuilder().addComponents(usernameInput);
            modal.addComponents(actionRow);
            await interaction.showModal(modal);
        }
    }
    else if (interaction.type === InteractionType.ModalSubmit) {
        if (interaction.customId === 'linkAccountModal') {
            await interaction.deferReply({ ephemeral: true });
            const robloxUsername = interaction.fields.getTextInputValue('robloxUsernameInput');
            const discordId = interaction.user.id;
            const discordUsername = interaction.user.tag;
            try {
                await apiClient.post('/api/discord/initiate-link', { robloxUsername, discordId, discordUsername });
                await interaction.editReply({
                    content: `✅ **Request Sent!**\nA confirmation request has been sent to the inbox of the Blox Battles account for **${robloxUsername}**.\n\nPlease log in to the website to complete the linking process.`,
                    flags: [MessageFlags.Ephemeral]
                });
            } catch (error) {
                const errorMessage = error.response?.data?.message || 'An unknown error occurred. Please try again later.';
                await interaction.editReply({ content: `❌ **Error:** ${errorMessage}`, flags: [MessageFlags.Ephemeral] });
            }
        }
    }
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
    const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setLabel('View Full Transcript').setStyle(ButtonStyle.Link).setURL(`${FRONTEND_URL}/transcripts/${duelId}`));
    return { embeds: [embed], components: [row] };
};

async function sendLinkSuccessDM(task) {
    try {
        const { discordId } = task.payload;
        const user = await client.users.fetch(discordId);
        if (user) {
            await user.send("✅ Your Blox Battles account has been successfully linked to this Discord account!");
            console.log(`Sent link success DM to user ${discordId}`);
        }
    } catch (dmError) {
        console.error(`Failed to send link success DM to user ${task.payload.discordId}:`, dmError.message);
    }
}

// [NEW] Function to send a "You've been challenged" DM
async function sendDuelChallengeDM(task) {
    try {
        const { recipientDiscordId, challengerUsername, wager, mapName } = task.payload;
        const user = await client.users.fetch(recipientDiscordId);
        if (user) {
            const embed = new EmbedBuilder()
                .setColor(0x58a6ff) // Blue
                .setTitle('⚔️ You Have Been Challenged!')
                .setDescription(`**${challengerUsername}** has challenged you to a duel.`)
                .addFields(
                    { name: 'Wager', value: `${wager.toLocaleString()} Gems`, inline: true },
                    { name: 'Map', value: mapName, inline: true }
                )
                .setTimestamp();
            const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setLabel('View on Dashboard').setStyle(ButtonStyle.Link).setURL(`${FRONTEND_URL}/dashboard`));
            await user.send({ embeds: [embed], components: [row] });
            console.log(`Sent new duel challenge DM to user ${recipientDiscordId}`);
        }
    } catch (dmError) {
        console.error(`Failed to send duel challenge DM to user ${task.payload.recipientDiscordId}:`, dmError.message);
    }
}

// [NEW] Function to send a "Your challenge was accepted" DM
async function sendDuelAcceptedDM(task) {
    try {
        const { recipientDiscordId, opponentUsername, duelId } = task.payload;
        const user = await client.users.fetch(recipientDiscordId);
        if (user) {
            const embed = new EmbedBuilder()
                .setColor(0x3fb950) // Green
                .setTitle('✅ Challenge Accepted!')
                .setDescription(`**${opponentUsername}** has accepted your challenge. The duel is now ready to start from your inbox.`)
                .setTimestamp()
                .setFooter({ text: `Duel ID: ${duelId}` });
            const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setLabel('Go to Dashboard').setStyle(ButtonStyle.Link).setURL(`${FRONTEND_URL}/dashboard`));
            await user.send({ embeds: [embed], components: [row] });
            console.log(`Sent duel accepted DM to user ${recipientDiscordId}`);
        }
    } catch (dmError) {
        console.error(`Failed to send duel accepted DM to user ${task.payload.recipientDiscordId}:`, dmError.message);
    }
}

// [NEW] Function to send a "Your opponent started the duel" DM
async function sendDuelStartedDM(task) {
    try {
        const { recipientDiscordId, starterUsername, serverLink, duelId } = task.payload;
        const user = await client.users.fetch(recipientDiscordId);
        if (user) {
            const embed = new EmbedBuilder()
                .setColor(0xf85149) // Red
                .setTitle('🔥 Your Duel Has Started!')
                .setDescription(`**${starterUsername}** has started the duel. Join the server now!`)
                .setTimestamp()
                .setFooter({ text: `Duel ID: ${duelId}` });
            const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setLabel('Join Server').setStyle(ButtonStyle.Link).setURL(serverLink));
            await user.send({ embeds: [embed], components: [row] });
            console.log(`Sent duel started DM to user ${recipientDiscordId}`);
        }
    } catch (dmError) {
        console.error(`Failed to send duel started DM to user ${task.payload.recipientDiscordId}:`, dmError.message);
    }
}


async function processDiscordTasks() {
    console.log('Fetching general Discord tasks...');
    try {
        const response = await apiClient.get('/api/tasks/bot/discord');
        const tasks = response.data;
        if (tasks.length === 0) return;
        
        for (const task of tasks) {
            // [MODIFIED] Added cases for the new duel notification task types.
            switch (task.task_type) {
                case 'POST_DUEL_RESULT_TO_DISCORD':
                    const channel = await client.channels.fetch(DUEL_RESULTS_CHANNEL_ID).catch(() => null);
                    if (channel) {
                        const messagePayload = buildDuelResultEmbed(task.payload);
                        await channel.send(messagePayload);
                    }
                    break;
                case 'SEND_DISCORD_LINK_SUCCESS_DM':
                    await sendLinkSuccessDM(task);
                    break;
                case 'SEND_DUEL_CHALLENGE_DM':
                    await sendDuelChallengeDM(task);
                    break;
                case 'SEND_DUEL_ACCEPTED_DM':
                    await sendDuelAcceptedDM(task);
                    break;
                case 'SEND_DUEL_STARTED_DM':
                    await sendDuelStartedDM(task);
                    break;
            }
            
            await apiClient.post(`/api/tasks/${task.id}/complete`);
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
        
        await guild.members.fetch();
        const memberCount = guild.memberCount;
        const memberChannelName = `📈 Members: ${memberCount.toLocaleString()}`;
        const memberChannel = await client.channels.fetch(MEMBERS_VC_ID).catch(() => null);
        if (memberChannel && memberChannel.name !== memberChannelName) {
            console.log(`Updating member count channel name from "${memberChannel.name}" to "${memberChannelName}"`);
            await memberChannel.setName(memberChannelName);
        }

        const response = await apiClient.get('/api/status/player-count');
        const playerCount = response.data.playerCount || 0;
        const playerChannelName = `💻 Players: ${playerCount.toLocaleString()}`;
        const playerChannel = await client.channels.fetch(PLAYERS_VC_ID).catch(() => null);
        if (playerChannel && playerChannel.name !== playerChannelName) {
            console.log(`Updating player count channel name from "${playerChannel.name}" to "${playerChannelName}"`);
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
