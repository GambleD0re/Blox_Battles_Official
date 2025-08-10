const { Events, InteractionType, ModalBuilder, ActionRowBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { apiClient } = require('../utils/apiClient');

module.exports = {
    name: Events.InteractionCreate,
    async execute(interaction) {
        if (interaction.isChatInputCommand()) {
            const command = interaction.client.commands.get(interaction.commandName);
            if (!command) {
                console.error(`No command matching ${interaction.commandName} was found.`);
                return;
            }
            try {
                await command.execute(interaction);
            } catch (error) {
                console.error(`Error executing ${interaction.commandName}`, error);
                const errorMessage = 'There was an error while executing this command!';
                if (interaction.replied || interaction.deferred) {
                    await interaction.followUp({ content: errorMessage, ephemeral: true });
                } else {
                    await interaction.reply({ content: errorMessage, ephemeral: true });
                }
            }
        } else if (interaction.isStringSelectMenu()) {
            if (interaction.customId === 'ticket_type_select') {
                const ticketType = interaction.values[0];
                const modal = new ModalBuilder()
                    .setCustomId(`ticket_creation_modal_${ticketType}`)
                    .setTitle(`Create a ${ticketType === 'support' ? 'Support' : 'Ban Appeal'} Ticket`);
                
                const subjectInput = new TextInputBuilder()
                    .setCustomId('ticket_subject_input')
                    .setLabel("Subject")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);

                if (ticketType === 'support') {
                    subjectInput.setPlaceholder('e.g., Issue with Gem Purchase, Reporting a Bug');
                } else if (ticketType === 'ban_appeal') {
                    subjectInput.setPlaceholder('e.g., Appeal for Ban on [Date]');
                }

                const descriptionInput = new TextInputBuilder()
                    .setCustomId('ticket_description_input')
                    .setLabel("Please describe your issue/appeal in detail")
                    .setStyle(TextInputStyle.Paragraph)
                    .setPlaceholder('Provide as much information as possible, including usernames, duel IDs, and dates if applicable.')
                    .setRequired(true);
                
                modal.addComponents(
                    new ActionRowBuilder().addComponents(subjectInput),
                    new ActionRowBuilder().addComponents(descriptionInput)
                );
                
                await interaction.showModal(modal);
            }
        } else if (interaction.isModalSubmit()) {
            if (interaction.customId.startsWith('ticket_creation_modal_')) {
                await interaction.deferReply({ ephemeral: true });

                const ticketType = interaction.customId.split('_')[3];
                const subject = interaction.fields.getTextInputValue('ticket_subject_input');
                const description = interaction.fields.getTextInputValue('ticket_description_input');
                const discordId = interaction.user.id;

                try {
                    const response = await apiClient.post('/discord/create-ticket', {
                        discordId,
                        ticketType,
                        subject,
                        description
                    });
                    await interaction.editReply({
                        content: response.data.message,
                    });
                } catch (error) {
                    const errorMessage = error.response?.data?.message || 'Failed to create your ticket. Please try again later.';
                     await interaction.editReply({
                        content: `❌ **Error:** ${errorMessage}`,
                    });
                }
            } else if (interaction.customId === 'link_account_modal') {
                await interaction.deferReply({ ephemeral: true });
                const robloxUsername = interaction.fields.getTextInputValue('roblox_username_input');
                try {
                    const response = await apiClient.post('/discord/initiate-link', {
                        robloxUsername: robloxUsername,
                        discordId: interaction.user.id,
                        discordUsername: interaction.user.username,
                    });
                    await interaction.editReply({
                        content: `✅ ${response.data.message} Please check your inbox on the Blox Battles website to confirm the link.`
                    });
                } catch (error) {
                    const errorMessage = error.response?.data?.message || 'An error occurred while trying to link your account.';
                    await interaction.editReply({
                        content: `❌ ${errorMessage}`
                    });
                }
            }
        }
    },
};
