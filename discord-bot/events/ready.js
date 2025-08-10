const { Events, ChannelType, PermissionsBitField, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { cacheGameData } = require('../utils/gameData');
const { startTaskProcessor } = require('../tasks/taskProcessor');
const { startStatusUpdaters } = require('../utils/statusUpdater');
const { SUPPORT_STAFF_ROLE_ID, SUPPORT_TICKETS_CATEGORY_ID } = process.env;

async function createInitializationTicket(client) {
    if (!SUPPORT_STAFF_ROLE_ID || !SUPPORT_TICKETS_CATEGORY_ID) {
        console.warn('[INIT TICKET] Missing SUPPORT_STAFF_ROLE_ID or SUPPORT_TICKETS_CATEGORY_ID. Skipping initialization ticket.');
        return;
    }

    try {
        const guild = client.guilds.cache.first();
        if (!guild) {
            console.error("[INIT TICKET] Bot is not in any guild.");
            return;
        }

        const channelName = 'initialization-ticket';
        let channel = guild.channels.cache.find(c => c.name === channelName && c.parentId === SUPPORT_TICKETS_CATEGORY_ID);

        if (!channel) {
            console.log(`[INIT TICKET] No initialization ticket found. Creating one...`);
            const permissionOverwrites = [
                { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
                { id: client.user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
                { id: SUPPORT_STAFF_ROLE_ID, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
            ];

            channel = await guild.channels.create({
                name: channelName,
                type: ChannelType.GuildText,
                parent: SUPPORT_TICKETS_CATEGORY_ID,
                topic: 'Bot status and initialization logs. Ticket ID: init-log-channel',
                permissionOverwrites,
            });
            console.log(`[INIT TICKET] Channel created: ${channel.name}`);
        }

        const embed = new EmbedBuilder()
            .setColor(0x3fb950)
            .setTitle('✅ Bot Initialized Successfully')
            .setDescription('All systems are online and running.')
            .setTimestamp()
            .setFooter({ text: 'Blox Battles Bot' });
        
        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('ticket_close_init')
                    .setLabel('Archive Channel')
                    .setStyle(ButtonStyle.Secondary)
            );

        await channel.send({
            content: `<@&${SUPPORT_STAFF_ROLE_ID}>`,
            embeds: [embed],
            components: [row]
        });

    } catch (error) {
        console.error('[INIT TICKET] Failed to create or post in initialization ticket:', error);
    }
}

module.exports = {
    name: Events.ClientReady,
    once: true,
    async execute(client) {
        console.log(`Bot logged in as ${client.user.tag}!`);

        try {
            await cacheGameData();
            startTaskProcessor(client);
            startStatusUpdaters(client);
            
            await createInitializationTicket(client);

            console.log("Bot initialization complete. Systems are running.");
        } catch (error) {
            console.error("A critical error occurred during bot initialization:", error);
        }
    },
};
