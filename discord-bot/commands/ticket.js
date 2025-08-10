const { SlashCommandBuilder, ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, StringSelectMenuBuilder, StringSelectMenuOptionBuilder } = require('discord.js');
const { apiClient } = require('../utils/apiClient');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ticket')
        .setDescription('Create a new support ticket or appeal.'),
    async execute(interaction) {
        try {
            await interaction.deferReply({ ephemeral: true });
            const { data: { user } } = await apiClient.post('/discord/check-user', { discordId: interaction.user.id });

            if (!user) {
                return interaction.editReply({
                    content: 'You must link your Blox Battles account before creating a ticket. Please use the `/link` command first.',
                    ephemeral: true
                });
            }

            const isBanned = user.status === 'banned';

            if (user.open_tickets && user.open_tickets.length > 0) {
                 return interaction.editReply({
                    content: `You already have an open ticket (Type: ${user.open_tickets[0].type.replace(/_/g, ' ')}). Please wait for it to be resolved before creating a new one.`,
                    ephemeral: true
                });
            }

            const modal = new ModalBuilder()
                .setCustomId('ticket_creation_modal')
                .setTitle('Create a New Ticket');

            const ticketTypeSelect = new StringSelectMenuBuilder()
                .setCustomId('ticket_type_select')
                .setPlaceholder('Select the reason for your ticket')
                .addOptions(
                    new StringSelectMenuOptionBuilder()
                        .setLabel('Ban Appeal')
                        .setDescription('Appeal a temporary or permanent ban.')
                        .setValue('ban_appeal')
                        .setDisabled(!isBanned),
                    new StringSelectMenuOptionBuilder()
                        .setLabel('Support Request')
                        .setDescription('For billing, technical issues, or other questions.')
                        .setValue('support')
                );

            const subjectInput = new TextInputBuilder()
                .setCustomId('ticket_subject_input')
                .setLabel("Subject")
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('e.g., Issue with Gem Purchase, Reporting a Bug')
                .setRequired(true);

            const descriptionInput = new TextInputBuilder()
                .setCustomId('ticket_description_input')
                .setLabel("Please describe your issue in detail")
                .setStyle(TextInputStyle.Paragraph)
                .setPlaceholder('Provide as much information as possible, including usernames, duel IDs, and dates if applicable.')
                .setRequired(true);

            const firstActionRow = new ActionRowBuilder().addComponents(ticketTypeSelect);
            const secondActionRow = new ActionRowBuilder().addComponents(subjectInput);
            const thirdActionRow = new ActionRowBuilder().addComponents(descriptionInput);

            modal.addComponents(secondActionRow, thirdActionRow);

            await interaction.editReply({
                content: 'Please select the type of ticket you wish to create.',
                components: [firstActionRow],
                ephemeral: true
            });

        } catch (error) {
            const errorMessage = error.response?.data?.message || 'An error occurred while initiating the ticket process.';
            console.error('Ticket command error:', error);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ content: `❌ **Error:** ${errorMessage}`, ephemeral: true });
            } else {
                await interaction.editReply({ content: `❌ **Error:** ${errorMessage}`, components: [] });
            }
        }
    },
};
