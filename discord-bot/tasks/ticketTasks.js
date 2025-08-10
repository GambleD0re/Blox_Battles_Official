const { ChannelType, PermissionsBitField, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { apiClient } = require('../utils/apiClient');

const {
    SUPPORT_TICKETS_CATEGORY_ID,
    BAN_APPEALS_CATEGORY_ID,
    DUEL_DISPUTES_CATEGORY_ID,
    SUPPORT_STAFF_ROLE_ID
} = process.env;

const categoryMap = {
    'support': SUPPORT_TICKETS_CATEGORY_ID,
    'temp_ban_appeal': BAN_APPEALS_CATEGORY_ID,
    'perm_ban_appeal': BAN_APPEALS_CATEGORY_ID,
    'duel_dispute': DUEL_DISPUTES_CATEGORY_ID
};

const typeColors = {
    'support': '#5865F2',
    'ban_appeal': '#ED4245',
    'duel_dispute': '#FEE75C'
};

async function handleCreateTicketChannel(client, task) {
    const { ticket_id, user_discord_id, ticket_type, subject } = task.payload;

    const guild = client.guilds.cache.first();
    if (!guild) throw new Error("Bot is not in any guild.");

    const user = await guild.members.fetch(user_discord_id).catch(() => null);
    if (!user) throw new Error(`User with Discord ID ${user_discord_id} not found in the guild.`);

    const categoryId = categoryMap[ticket_type];
    if (!categoryId) throw new Error(`Invalid or unconfigured category for ticket type: ${ticket_type}`);
    
    const categoryChannel = guild.channels.cache.get(categoryId);
    if (!categoryChannel || categoryChannel.type !== ChannelType.GuildCategory) {
        throw new Error(`Category with ID ${categoryId} not found or is not a category channel.`);
    }

    const channelName = `${ticket_type.replace(/_/g, '-')}-${user.user.username}`;

    const permissionOverwrites = [
        {
            id: guild.id,
            deny: [PermissionsBitField.Flags.ViewChannel],
        },
        {
            id: user.id,
            allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.AttachFiles, PermissionsBitField.Flags.EmbedLinks],
        },
        {
            id: client.user.id,
            allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ManageChannels],
        },
    ];

    if (SUPPORT_STAFF_ROLE_ID) {
        permissionOverwrites.push({
            id: SUPPORT_STAFF_ROLE_ID,
            allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ManageMessages],
        });
    }

    const channel = await guild.channels.create({
        name: channelName,
        type: ChannelType.GuildText,
        parent: categoryChannel,
        topic: `Ticket ID: ${ticket_id} for ${user.user.tag}. Subject: ${subject}`,
        permissionOverwrites: permissionOverwrites,
    });

    const embed = new EmbedBuilder()
        .setColor(typeColors[ticket_type.includes('ban') ? 'ban_appeal' : ticket_type] || '#2B2D31')
        .setTitle(`Ticket Opened: ${subject}`)
        .setDescription(`Welcome, ${user}! A staff member will be with you shortly.\n\nPlease provide any additional information or evidence below. You will be notified here when your ticket is resolved.`)
        .addFields({ name: 'Ticket Type', value: ticket_type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()), inline: true })
        .setTimestamp()
        .setFooter({ text: `Ticket ID: ${ticket_id}` });

    const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('ticket_close')
                .setLabel('Close Ticket')
                .setStyle(ButtonStyle.Danger)
        );

    await channel.send({
        content: SUPPORT_STAFF_ROLE_ID ? `<@${user.id}> <@&${SUPPORT_STAFF_ROLE_ID}>` : `<@${user.id}>`,
        embeds: [embed],
        components: [row]
    });

    await apiClient.post(`/discord/update-ticket-channel`, { ticketId: ticket_id, channelId: channel.id });
    console.log(`[TICKETS] Successfully created channel ${channel.id} for ticket ${ticket_id}.`);
}

module.exports = { handleCreateTicketChannel };
