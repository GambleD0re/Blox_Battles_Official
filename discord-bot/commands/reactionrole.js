const { SlashCommandBuilder, EmbedBuilder, ChannelType, PermissionsBitField } = require('discord.js');
const { apiClient } = require('../utils/apiClient');
const { SUPPORT_STAFF_ROLE_ID } = process.env;

module.exports = {
    data: new SlashCommandBuilder()
        .setName('reactionrole')
        .setDescription('Manage reaction roles for the server.')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageRoles) // Changed to ManageRoles
        .setDMPermission(false)
        .addSubcommand(subcommand =>
            subcommand
                .setName('setup')
                .setDescription('Creates a new message/embed for reaction roles.')
                .addChannelOption(option =>
                    option.setName('channel')
                        .setDescription('The channel to send the reaction role message to.')
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('title')
                        .setDescription('The title of the embed message.')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('description')
                        .setDescription('The main text of the embed message. Use "\\n" for new lines.')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('color')
                        .setDescription('A hex color code for the embed (e.g., #58a6ff).')
                        .setRequired(false))
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('add')
                .setDescription('Adds a role-to-emoji mapping to a reaction role message.')
                .addStringOption(option =>
                    option.setName('message_id')
                        .setDescription('The message ID of the reaction role embed.')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('emoji')
                        .setDescription('The emoji to react with (can be a custom emoji).')
                        .setRequired(true))
                .addRoleOption(option =>
                    option.setName('role')
                        .setDescription('The role to assign when the user reacts.')
                        .setRequired(true))
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('remove')
                .setDescription('Removes a role-to-emoji mapping from a reaction role message.')
                .addStringOption(option =>
                    option.setName('message_id')
                        .setDescription('The message ID of the reaction role embed.')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('emoji')
                        .setDescription('The emoji of the rule to remove.')
                        .setRequired(true))
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('list')
                .setDescription('Lists all configured reaction roles for a specific message.')
                .addStringOption(option =>
                    option.setName('message_id')
                        .setDescription('The message ID of the reaction role embed.')
                        .setRequired(true))
        ),

    async execute(interaction) {
        // This is the updated permission check. It now checks for the specific staff role.
        if (!interaction.member.roles.cache.has(SUPPORT_STAFF_ROLE_ID)) {
            return interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
        }

        const subcommand = interaction.options.getSubcommand();
        await interaction.deferReply({ ephemeral: true });

        try {
            switch (subcommand) {
                case 'setup':
                    await handleSetup(interaction);
                    break;
                case 'add':
                    await handleAdd(interaction);
                    break;
                case 'remove':
                    await handleRemove(interaction);
                    break;
                case 'list':
                    await handleList(interaction);
                    break;
            }
        } catch (error) {
            const errorMessage = error.response?.data?.message || error.message || 'An unknown error occurred.';
            console.error(`Reaction Role command error (${subcommand}):`, error);
            await interaction.editReply({ content: `❌ **Error:** ${errorMessage}` });
        }
    },
};

async function handleSetup(interaction) {
    const channel = interaction.options.getChannel('channel');
    const title = interaction.options.getString('title');
    const description = interaction.options.getString('description').replace(/\\n/g, '\n');
    const color = interaction.options.getString('color') || '#58a6ff';

    const embed = new EmbedBuilder()
        .setTitle(title)
        .setDescription(description)
        .setColor(color);

    const message = await channel.send({ embeds: [embed] });

    await interaction.editReply({
        content: `✅ Reaction role message has been created in ${channel}.\n**Message ID:** \`${message.id}\`\n\nUse this ID with the \`/reactionrole add\` command to assign roles.`
    });
}

async function handleAdd(interaction) {
    const messageId = interaction.options.getString('message_id');
    const emoji = interaction.options.getString('emoji');
    const role = interaction.options.getRole('role');

    const emojiId = emoji.match(/<a?:.+:(\d+)>$/)?.[1] || emoji;

    if (role.position >= interaction.guild.members.me.roles.highest.position) {
        return interaction.editReply({ content: `❌ **Error:** I cannot assign the **${role.name}** role because it is higher than or equal to my own highest role in the server hierarchy.` });
    }

    await apiClient.post('/discord/reaction-roles', { messageId, emojiId, roleId: role.id });

    try {
        const targetMessage = await interaction.channel.messages.fetch(messageId);
        await targetMessage.react(emoji);
    } catch (e) {
        console.warn(`Could not find message ${messageId} to react, or failed to react.`);
    }

    await interaction.editReply({ content: `✅ Successfully configured ${emoji} to grant the **${role.name}** role on message \`${messageId}\`.` });
}

async function handleRemove(interaction) {
    const messageId = interaction.options.getString('message_id');
    const emoji = interaction.options.getString('emoji');
    const emojiId = emoji.match(/<a?:.+:(\d+)>$/)?.[1] || emoji;

    await apiClient.delete('/discord/reaction-roles', { data: { messageId, emojiId } });

    await interaction.editReply({ content: `✅ Successfully removed the rule for ${emoji} on message \`${messageId}\`.` });
}

async function handleList(interaction) {
    const messageId = interaction.options.getString('message_id');
    const { data: rules } = await apiClient.get(`/discord/reaction-roles/bymessage/${messageId}`);

    if (!rules || rules.length === 0) {
        return interaction.editReply({ content: `No reaction roles are configured for message ID \`${messageId}\`.` });
    }

    const description = rules.map(rule => {
        const emoji = isNaN(rule.emoji_id) ? rule.emoji_id : `<:_:${rule.emoji_id}>`;
        return `${emoji} ➜ <@&${rule.role_id}>`;
    }).join('\n');

    const embed = new EmbedBuilder()
        .setTitle(`Reaction Roles for Message \`${messageId}\``)
        .setDescription(description)
        .setColor('#58a6ff');

    await interaction.editReply({ embeds: [embed] });
}
