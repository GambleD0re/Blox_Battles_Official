const { SlashCommandBuilder, ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { apiClient } = require('../utils/apiClient');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('link')
        .setDescription('Link your Discord account to your Blox Battles account.'),
    async execute(interaction) {
        const modal = new ModalBuilder()
            .setCustomId('link_account_modal')
            .setTitle('Link Blox Battles Account');

        const robloxUsernameInput = new TextInputBuilder()
            .setCustomId('roblox_username_input')
            .setLabel("What is your Roblox username?")
            .setStyle(TextInputStyle.Short)
            .setPlaceholder('Enter your exact Roblox username')
            .setRequired(true);

        const actionRow = new ActionRowBuilder().addComponents(robloxUsernameInput);
        modal.addComponents(actionRow);

        await interaction.showModal(modal);
    },
};
