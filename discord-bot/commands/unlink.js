const { SlashCommandBuilder } = require('discord.js');
const { apiClient } = require('../utils/apiClient');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('unlink')
        .setDescription('Unlink your Discord account from your Blox Battles account.'),
    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });
        try {
            const response = await apiClient.post('/discord/unlink', {
                discordId: interaction.user.id
            });
            await interaction.editReply({ content: `✅ ${response.data.message}` });
        } catch (error) {
            const errorMessage = error.response?.data?.message || 'An error occurred while unlinking your account.';
            await interaction.editReply({ content: `❌ ${errorMessage}` });
        }
    },
};
