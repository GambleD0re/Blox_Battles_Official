--- START OF FILE discord-bot/commands/reactionrole.js ---
const { SlashCommandBuilder, EmbedBuilder, PermissionsBitField } = require('discord.js');
const { apiClient } = require('../utils/apiClient');

const MANAGE_ROLES_PERMISSION = PermissionsBitField.Flags.ManageRoles;

module.exports = {
    data: new SlashCommandBuilder()
        .setName('reactionrole')
        .setDescription('Manage reaction roles for the server.')
        .setDefaultMemberPermissions(MANAGE_ROLES_PERMISSION)
        .setDMPermission(false)
        .addSubcommand(subcommand =>
            subcommand
                .setName('setup')
                .setDescription('Creates a new message for reaction roles.')
                .addChannelOption(option => option.setName('channel').setDescription('The channel for the message.').setRequired(true))
                .addStringOption(option => option.setName('title').setDescription('The title of the embed.').setRequired(true))
                .addStringOption(option => option.setName('description').setDescription('The message content. Use "\\n" for new lines.').setRequired(true))
                .addStringOption(option => option.setName('color').setDescription('A hex color code (e.g., #58a6ff).'))
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('add')
                .setDescription('Adds a role-to-emoji mapping to a message.')
                .addStringOption(option => option.setName('message_id').setDescription('The ID of the message to add the role to.').setRequired(true))
                .addStringOption(option => option.setName('emoji').setDescription('The emoji to use for the reaction.').setRequired(true))
                .addRoleOption(option => option.setName('role').setDescription('The role to assign.').setRequired(true))
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('remove')
                .setDescription('Removes a role-to-emoji mapping from a message.')
                .addStringOption(option => option.setName('message_id').setDescription('The ID of the message to remove the role from.').setRequired(true))
                .addStringOption(option => option.setName('emoji').setDescription('The emoji of the rule to remove.').setRequired(true))
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('list')
                .setDescription('Lists all configured reaction roles for a message.')
                .addStringOption(option => option.setName('message_id').setDescription('The ID of the message to list roles for.').setRequired(true))
        ),

    async execute(interaction) {
        if (!interaction.member.permissions.has(MANAGE_ROLES_PERMISSION)) {
            return interaction.reply({ content: 'You do not have permission to manage roles.', ephemeral: true });
        }

        const subcommand = interaction.options.getSubcommand();
        await interaction.deferReply({ ephemeral: true });

        try {
            if (subcommand === 'setup') {
                const channel = interaction.options.getChannel('channel');
                const title = interaction.options.getString('title');
                const description = interaction.options.getString('description').replace(/\\n/g, '\n');
                const color = interaction.options.getString('color') || '#58a6ff';

                const embed = new EmbedBuilder().setColor(color).setTitle(title).setDescription(description);
                const message = await channel.send({ embeds: [embed] });

                await interaction.editReply(`✅ Reaction role message created in ${channel}! Message ID: \`${message.id}\``);
            } 
            else if (subcommand === 'add') {
                const messageId = interaction.options.getString('message_id');
                const emoji = interaction.options.getString('emoji');
                const role = interaction.options.getRole('role');

                const customEmojiRegex = /<a?:_:.+?:\d{18}>/;
                const emojiId = customEmojiRegex.test(emoji) ? emoji.match(/\d{18}/)[0] : emoji;
                
                await apiClient.post('/discord/reaction-roles', { messageId, emojiId, roleId: role.id });

                const targetMessage = await interaction.channel.messages.fetch(messageId).catch(() => null);
                if (targetMessage) {
                    await targetMessage.react(emoji);
                }

                await interaction.editReply(`✅ Rule added: Reacting with ${emoji} will now grant the **${role.name}** role.`);
            } 
            else if (subcommand === 'remove') {
                const messageId = interaction.options.getString('message_id');
                const emoji = interaction.options.getString('emoji');
                const emojiId = /<a?:_:.+?:\d{18}>/.test(emoji) ? emoji.match(/\d{18}/)[0] : emoji;
                
                await apiClient.delete('/discord/reaction-roles', { data: { messageId, emojiId } });

                await interaction.editReply(`✅ Rule removed for emoji ${emoji}.`);
            } 
            else if (subcommand === 'list') {
                const messageId = interaction.options.getString('message_id');
                const { data: rules } = await apiClient.get(`/discord/reaction-roles/bymessage/${messageId}`);

                if (rules.length === 0) {
                    return interaction.editReply('No reaction roles found for that message.');
                }
                const description = rules.map(rule => `- ${interaction.guild.emojis.cache.get(rule.emoji_id) || rule.emoji_id}: <@&${rule.role_id}>`).join('\n');
                const embed = new EmbedBuilder().setTitle(`Reaction Roles for Message ${messageId}`).setDescription(description);
                await interaction.editReply({ embeds: [embed] });
            }
        } catch (error) {
            const errorMessage = error.response?.data?.message || 'An error occurred.';
            await interaction.editReply(`❌ **Error:** ${errorMessage}`);
        }
    },
};
