// discord-bot/bot.js
require('dotenv').config();
const axios = require('axios');
const {
    Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder,
    ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder,
    TextInputStyle, InteractionType, MessageFlags,
    StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ApplicationCommandOptionType
} = require('discord.js');

// --- Configuration ---
const {
    DISCORD_BOT_TOKEN, BOT_API_KEY, BACKEND_API_URL, FRONTEND_URL, UPDATE_INTERVAL_SECONDS,
    DUEL_RESULTS_CHANNEL_ID, NA_EAST_VC_ID, NA_WEST_VC_ID, EUROPE_VC_ID, OCE_VC_ID,
    MEMBERS_VC_ID, PLAYERS_VC_ID
} = process.env;

const UPDATE_INTERVAL_MS = parseInt(UPDATE_INTERVAL_SECONDS, 10) * 1000 || 15000;
const STATS_UPDATE_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes

const apiClient = axios.create({ baseURL: BACKEND_API_URL, headers: { 'X-API-Key': BOT_API_KEY } });

const REGION_CHANNELS = {
    'NA-East': { id: NA_EAST_VC_ID, name: 'NA-East' },
    'NA-West': { id: NA_WEST_VC_ID, name: 'NA-West' },
    'EU': { id: EUROPE_VC_ID, name: 'Europe' },
    'OCE': { id: OCE_VC_ID, name: 'Oceania' }
};

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] });

// --- Bot State Management ---
let gameData = { maps: [], weapons: [], regions: [] };
const activeDuelBuilders = new Map();

// --- Helper Functions ---

async function cacheGameData() {
    try {
        const response = await apiClient.get('/api/gamedata');
        gameData = response.data;
        console.log(`Successfully cached game data: ${gameData.maps.length} maps, ${gameData.weapons.length} weapons, ${gameData.regions.length} regions.`);
    } catch (error) {
        console.error("Failed to cache game data:", error.message);
    }
}

function buildDuelBuilderMessage(state) {
    const embed = new EmbedBuilder()
        .setColor(0x58a6ff)
        .setTitle('⚔️ Building Your Duel Challenge')
        .setDescription(`You are challenging **${state.opponentUsername}**. Configure the duel using the components below.`)
        .addFields(
            { name: 'Region', value: state.region ? gameData.regions.find(r => r.id === state.region)?.name : 'Not Set', inline: true },
            { name: 'Wager', value: state.wager ? `${state.wager.toLocaleString()} Gems` : 'Not Set', inline: true },
            { name: 'Map', value: state.map ? gameData.maps.find(m => m.id === state.map)?.name : 'Not Set', inline: true },
            { name: 'Banned Weapons', value: state.banned_weapons.length > 0 ? state.banned_weapons.map(wId => gameData.weapons.find(w => w.id === wId)?.name).join(', ') : 'None' }
        )
        .setFooter({ text: 'This builder will expire in 5 minutes.' });

    const regionMenu = new StringSelectMenuBuilder()
        .setCustomId(`duel_builder_region_${state.interactionId}`)
        .setPlaceholder('Select a Server Region')
        .addOptions(gameData.regions.map(region => new StringSelectMenuOptionBuilder().setLabel(region.name).setValue(region.id)));

    const mapMenu = new StringSelectMenuBuilder()
        .setCustomId(`duel_builder_map_${state.interactionId}`)
        .setPlaceholder('Select a Map')
        .addOptions(gameData.maps.slice(0, 25).map(map => new StringSelectMenuOptionBuilder().setLabel(map.name).setValue(map.id)));

    const weaponsMenu = new StringSelectMenuBuilder()
        .setCustomId(`duel_builder_weapons_${state.interactionId}`)
        .setPlaceholder('Select Weapons to Ban (Optional)')
        .setMinValues(0)
        .setMaxValues(gameData.weapons.length)
        .addOptions(gameData.weapons.map(w => new StringSelectMenuOptionBuilder().setLabel(w.name).setValue(w.id)));

    const actionButtons = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`duel_builder_wager_${state.interactionId}`).setLabel('Set Wager').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`duel_builder_cancel_${state.interactionId}`).setLabel('Cancel').setStyle(ButtonStyle.Secondary)
    );

    const sendButton = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`duel_builder_send_${state.interactionId}`)
            .setLabel('Send Challenge')
            .setStyle(ButtonStyle.Success)
            .setDisabled(!state.wager || !state.map)
    );

    return {
        embeds: [embed],
        components: [
            new ActionRowBuilder().addComponents(regionMenu),
            new ActionRowBuilder().addComponents(mapMenu),
            new ActionRowBuilder().addComponents(weaponsMenu),
            actionButtons,
            sendButton
        ],
        ephemeral: true
    };
}

// --- Main Interaction Router ---
client.on('interactionCreate', async interaction => {
    if (interaction.isChatInputCommand()) {
        const { commandName } = interaction;

        if (commandName === 'link') {
            const modal = new ModalBuilder().setCustomId('linkAccountModal').setTitle('Link Your Blox Battles Account');
            const usernameInput = new TextInputBuilder().setCustomId('robloxUsernameInput').setLabel("Your Blox Battles (Roblox) Username").setStyle(TextInputStyle.Short).setPlaceholder('Enter your exact Roblox username').setRequired(true);
            modal.addComponents(new ActionRowBuilder().addComponents(usernameInput));
            return await interaction.showModal(modal);
        }

        if (commandName === 'unlink') {
            const embed = new EmbedBuilder().setColor(0xf85149).setTitle('Unlink Account Confirmation').setDescription('Are you sure you want to unlink your Discord account from your Blox Battles account? You will stop receiving all notifications.');
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('confirm_unlink').setLabel('Confirm').setStyle(ButtonStyle.Danger),
                new ButtonBuilder().setCustomId('cancel_unlink').setLabel('Cancel').setStyle(ButtonStyle.Secondary)
            );
            return await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
        }

        if (commandName === 'challenge') {
            const opponent = interaction.options.getUser('opponent');
            if (opponent.bot) return interaction.reply({ content: "You cannot challenge a bot.", ephemeral: true });
            if (opponent.id === interaction.user.id) return interaction.reply({ content: "You cannot challenge yourself.", ephemeral: true });
            
            // [MODIFIED] Defer the reply immediately before any async operations.
            await interaction.deferReply({ ephemeral: true });

            try {
                const preCheck = await apiClient.post('/api/discord/duels/pre-check', {
                    challengerDiscordId: interaction.user.id,
                    opponentDiscordId: opponent.id,
                });
                
                const duelState = {
                    interactionId: interaction.id,
                    challenger: { id: interaction.user.id, maxGems: preCheck.data.challenger.gems },
                    opponent: { id: opponent.id, username: preCheck.data.opponent.username },
                    opponentUsername: opponent.username,
                    wager: null, map: null, region: null, banned_weapons: []
                };

                activeDuelBuilders.set(interaction.id, duelState);
                
                setTimeout(() => {
                    if (activeDuelBuilders.has(interaction.id)) {
                        activeDuelBuilders.delete(interaction.id);
                        interaction.editReply({ content: 'Your duel builder has expired due to inactivity.', embeds: [], components: [] }).catch(() => {});
                    }
                }, 5 * 60 * 1000);

                const messagePayload = buildDuelBuilderMessage(duelState);
                await interaction.editReply(messagePayload);

            } catch (error) {
                const errorMessage = error.response?.data?.message || 'An unknown error occurred during pre-check.';
                await interaction.editReply({ content: `❌ **Error:** ${errorMessage}` });
            }
        }
    }
    else if (interaction.isMessageComponent()) {
        const customIdParts = interaction.customId.split('_');
        const componentType = customIdParts[0];

        if (componentType === 'accept' || componentType === 'decline') {
            const duelId = customIdParts[1];
            const expectedOpponentId = interaction.message.mentions.users.first()?.id;

            if (interaction.user.id !== expectedOpponentId) {
                return interaction.reply({ content: "This is not your challenge to respond to!", ephemeral: true });
            }

            await interaction.deferUpdate();
            try {
                await apiClient.post('/api/discord/duels/respond', { duelId, discordId: interaction.user.id, response: componentType });
                
                const finalEmbed = EmbedBuilder.from(interaction.message.embeds[0]);
                finalEmbed.setColor(componentType === 'accept' ? 0x3fb950 : 0xf85149);
                finalEmbed.addFields({ name: 'Status', value: `**${componentType.toUpperCase()}ED** by ${interaction.user.username}` });
                
                await interaction.editReply({ embeds: [finalEmbed], components: [] });
            } catch (error) {
                const errorMessage = error.response?.data?.message || 'An error occurred while responding.';
                await interaction.followUp({ content: `❌ **Error:** ${errorMessage}`, ephemeral: true });
            }
            return;
        }

        if (customIdParts[0] === 'duel' && customIdParts[1] === 'builder') {
            const interactionId = customIdParts[3];
            const state = activeDuelBuilders.get(interactionId);
            if (!state) return interaction.update({ content: "This duel builder has expired.", embeds: [], components: [] });
            
            const subAction = customIdParts[2];
            
            if (interaction.isStringSelectMenu()) {
                if (subAction === 'region') state.region = interaction.values[0];
                if (subAction === 'map') state.map = interaction.values[0];
                if (subAction === 'weapons') state.banned_weapons = interaction.values;
            } else if (interaction.isButton()) {
                if (subAction === 'cancel') {
                    activeDuelBuilders.delete(interactionId);
                    return interaction.update({ content: 'Duel challenge canceled.', embeds: [], components: [] });
                }
                if (subAction === 'wager') {
                    const modal = new ModalBuilder().setCustomId(`duel_builder_wager_${interactionId}`).setTitle('Set Your Wager');
                    const wagerInput = new TextInputBuilder().setCustomId('wager_input').setLabel("Wager Amount (Gems)").setStyle(TextInputStyle.Short).setRequired(true);
                    modal.addComponents(new ActionRowBuilder().addComponents(wagerInput));
                    return interaction.showModal(modal);
                }
                if (subAction === 'send') {
                    await interaction.deferUpdate();
                    try {
                        const { data } = await apiClient.post('/api/discord/duels/create', {
                            challengerDiscordId: state.challenger.id,
                            opponentDiscordId: state.opponent.id,
                            wager: state.wager, map: state.map, region: state.region, banned_weapons: state.banned_weapons
                        });
                        activeDuelBuilders.delete(interactionId);
                        
                        const challengeEmbed = EmbedBuilder.from(interaction.message.embeds[0])
                            .setTitle(`⚔️ ${interaction.user.username} has challenged ${state.opponentUsername}!`)
                            .setDescription('The opponent has 5 minutes to respond.')
                            .setTimestamp();
                        const buttons = new ActionRowBuilder().addComponents(
                            new ButtonBuilder().setCustomId(`accept_${data.duelId}`).setLabel('Accept').setStyle(ButtonStyle.Success),
                            new ButtonBuilder().setCustomId(`decline_${data.duelId}`).setLabel('Decline').setStyle(ButtonStyle.Danger)
                        );
                        
                        const publicMessage = await interaction.channel.send({ content: `<@${state.opponent.id}>`, embeds: [challengeEmbed], components: [buttons] });
                        await interaction.editReply({ content: '✅ Challenge sent successfully!', embeds: [], components: [] });
                        
                        setTimeout(async () => {
                            const currentMessage = await interaction.channel.messages.fetch(publicMessage.id).catch(()=>null);
                            if (currentMessage && currentMessage.components.length > 0) {
                                await apiClient.post('/api/discord/duels/cancel', { duelId: data.duelId });
                                const expiredEmbed = EmbedBuilder.from(currentMessage.embeds[0]).addFields({ name: 'Status', value: '⌛ **EXPIRED**' }).setColor(0x7d8590);
                                await currentMessage.edit({ embeds: [expiredEmbed], components: [] });
                            }
                        }, 5 * 60 * 1000);

                    } catch(error) {
                        const errorMessage = error.response?.data?.message || 'An unknown error occurred.';
                        await interaction.editReply({ content: `❌ **Error:** ${errorMessage}`, embeds: [], components: [] });
                    }
                    return;
                }
            }
            const messagePayload = buildDuelBuilderMessage(state);
            await interaction.update(messagePayload);
        }

        if (componentType === 'confirm' && customIdParts[1] === 'unlink') {
            try {
                await apiClient.post('/api/discord/unlink', { discordId: interaction.user.id });
                const successEmbed = new EmbedBuilder().setColor(0x3fb950).setTitle('✅ Success').setDescription('Your Discord account has been successfully unlinked.');
                await interaction.update({ embeds: [successEmbed], components: [] });
            } catch (error) {
                const errorMessage = error.response?.data?.message || 'An unknown error occurred.';
                const errorEmbed = new EmbedBuilder().setColor(0xf85149).setTitle('❌ Error').setDescription(errorMessage);
                await interaction.update({ embeds: [errorEmbed], components: [] });
            }
        } else if (componentType === 'cancel' && customIdParts[1] === 'unlink') {
            const cancelEmbed = new EmbedBuilder().setColor(0x58a6ff).setTitle('🚫 Canceled').setDescription('The unlink process has been canceled.');
            await interaction.update({ embeds: [cancelEmbed], components: [] });
        }
    }
    else if (interaction.isModalSubmit()) {
        const customIdParts = interaction.customId.split('_');
        const componentType = customIdParts[0];

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

        if (componentType === 'duel' && customIdParts[1] === 'builder' && customIdParts[2] === 'wager') {
            const interactionId = customIdParts[3];
            const state = activeDuelBuilders.get(interactionId);
            if (!state) return interaction.update({ content: "This duel builder has expired.", embeds: [], components: [] });

            const wagerAmount = parseInt(interaction.fields.getTextInputValue('wager_input'), 10);
            if (isNaN(wagerAmount) || wagerAmount <= 0) {
                return interaction.reply({ content: 'Please enter a valid, positive number for the wager.', ephemeral: true });
            }
            if (wagerAmount > state.challenger.maxGems) {
                return interaction.reply({ content: `You do not have enough gems. Your balance is ${state.challenger.maxGems.toLocaleString()}.`, ephemeral: true });
            }
            
            state.wager = wagerAmount;
            const messagePayload = buildDuelBuilderMessage(state);
            await interaction.update(messagePayload);
        }
    }
});

// --- Task Handlers ---

const buildDuelResultEmbed = (taskPayload) => {
    const { duelId, winner, loser, wager, pot, mapName, finalScores, playerLoadouts } = taskPayload;
    const winnerLoadout = playerLoadouts?.[winner.username]?.join(', ') || 'N/A';
    const loserLoadout = playerLoadouts?.[loser.username]?.join(', ') || 'N/A';
    const embed = new EmbedBuilder()
        .setColor(0x3fb950).setTitle(`⚔️ Duel Result: ${winner.username} vs. ${loser.username}`).setURL(`${FRONTEND_URL}/transcripts/${duelId}`)
        .setThumbnail(winner.avatarUrl || `https://www.roblox.com/headshot-thumbnail/image?userId=${winner.robloxId}&width=150&height=150&format=png`)
        .addFields(
            { name: '🏆 Winner', value: `**${winner.username}**\n💰 **+${pot.toLocaleString()}** Gems`, inline: true },
            { name: '💔 Loser', value: `**${loser.username}**\n💸 **-${wager.toLocaleString()}** Gems`, inline: true },
            { name: '📊 Score & Map', value: `\`${finalScores ? Object.values(finalScores).join(' - ') : 'N/A'}\` on **${mapName}**`, inline: false },
            { name: `${winner.username}'s Loadout`, value: `\`\`\`${winnerLoadout}\`\`\``, inline: true },
            { name: `${loser.username}'s Loadout`, value: `\`\`\`${loserLoadout}\`\`\``, inline: true }
        ).setTimestamp().setFooter({ text: `Duel ID: ${duelId}` });
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

async function sendDuelChallengeDM(task) {
    try {
        const { recipientDiscordId, challengerUsername, wager, mapName } = task.payload;
        const user = await client.users.fetch(recipientDiscordId);
        if (user) {
            const embed = new EmbedBuilder()
                .setColor(0x58a6ff)
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

async function sendDuelAcceptedDM(task) {
    try {
        const { recipientDiscordId, opponentUsername, duelId } = task.payload;
        const user = await client.users.fetch(recipientDiscordId);
        if (user) {
            const embed = new EmbedBuilder()
                .setColor(0x3fb950)
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

async function sendDuelStartedDM(task) {
    try {
        const { recipientDiscordId, starterUsername, serverLink, duelId } = task.payload;
        const user = await client.users.fetch(recipientDiscordId);
        if (user) {
            const embed = new EmbedBuilder()
                .setColor(0xf85149)
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
            switch (task.task_type) {
                case 'POST_DUEL_RESULT_TO_DISCORD':
                    const channel = await client.channels.fetch(DUEL_RESULTS_CHANNEL_ID).catch(() => null);
                    if (channel) {
                        await channel.send(buildDuelResultEmbed(task.payload));
                    }
                    break;
                case 'SEND_DISCORD_LINK_SUCCESS_DM': await sendLinkSuccessDM(task); break;
                case 'SEND_DUEL_CHALLENGE_DM': await sendDuelChallengeDM(task); break;
                case 'SEND_DUEL_ACCEPTED_DM': await sendDuelAcceptedDM(task); break;
                case 'SEND_DUEL_STARTED_DM': await sendDuelStartedDM(task); break;
            }
            await apiClient.post(`/api/tasks/${task.id}/complete`);
        }
    } catch (err) {
        console.error(`Error processing Discord tasks: ${err.message}`);
    }
}

// --- Stat and Status Updaters ---

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

// --- Bot Startup ---
client.once('ready', async () => {
    console.log(`Bot logged in as ${client.user.tag}!`);
    await cacheGameData();
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
