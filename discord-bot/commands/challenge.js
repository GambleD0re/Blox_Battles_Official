const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, EmbedBuilder } = require('discord.js');
const { apiClient } = require('../utils/apiClient');
const { getGameData } = require('../utils/gameData');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('challenge')
        .setDescription('Challenge another player to a duel.')
        .addUserOption(option =>
            option.setName('opponent')
                .setDescription('The user you want to challenge')
                .setRequired(true)),
    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });

        const opponent = interaction.options.getUser('opponent');
        const challenger = interaction.user;

        if (opponent.bot) {
            return interaction.editReply({ content: 'You cannot challenge a bot.' });
        }
        if (opponent.id === challenger.id) {
            return interaction.editReply({ content: 'You cannot challenge yourself.' });
        }

        try {
            const { data } = await apiClient.post('/discord/duels/pre-check', {
                challengerDiscordId: challenger.id,
                opponentDiscordId: opponent.id,
            });

            const gameData = getGameData();
            const mapOptions = gameData.maps.map(map => ({
                label: map.name,
                value: map.id,
            }));

            const wagerButtons = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder().setCustomId('wager_100').setLabel('100 Gems').setStyle(ButtonStyle.Primary),
                    new ButtonBuilder().setCustomId('wager_250').setLabel('250 Gems').setStyle(ButtonStyle.Primary),
                    new ButtonBuilder().setCustomId('wager_500').setLabel('500 Gems').setStyle(ButtonStyle.Primary),
                    new ButtonBuilder().setCustomId('wager_1000').setLabel('1,000 Gems').setStyle(ButtonStyle.Primary)
                );
            
            const mapSelect = new ActionRowBuilder()
                .addComponents(
                    new StringSelectMenuBuilder()
                        .setCustomId('map_select')
                        .setPlaceholder('Select a map')
                        .addOptions(mapOptions.slice(0, 25)) // Max 25 options per menu
                );

            const embed = new EmbedBuilder()
                .setColor(0x58a6ff)
                .setTitle(`⚔️ Creating Duel vs ${opponent.username}`)
                .setDescription('Please select a wager and a map below.')
                .addFields({ name: 'Your Gems', value: data.challenger.gems.toLocaleString(), inline: true });

            const message = await interaction.editReply({
                embeds: [embed],
                components: [wagerButtons, mapSelect],
                ephemeral: true,
            });

            const collector = message.createMessageComponentCollector({ time: 60000 });
            let selectedWager = null;
            let selectedMap = null;

            collector.on('collect', async i => {
                if (i.customId.startsWith('wager_')) {
                    selectedWager = parseInt(i.customId.split('_')[1], 10);
                } else if (i.customId === 'map_select') {
                    selectedMap = i.values[0];
                }

                if (selectedWager && selectedMap) {
                    await i.deferUpdate();
                    try {
                        const response = await apiClient.post('/discord/duels/create', {
                            challengerDiscordId: challenger.id,
                            opponentDiscordId: opponent.id,
                            wager: selectedWager,
                            map: selectedMap,
                            region: 'NA-East', // Default region for Discord challenges
                            banned_weapons: []
                        });
                        await interaction.editReply({
                            content: `✅ Challenge for **${selectedWager} Gems** on **${gameData.maps.find(m => m.id === selectedMap).name}** sent to ${opponent.username}!`,
                            embeds: [],
                            components: []
                        });
                        collector.stop();
                    } catch (err) {
                        await interaction.editReply({ content: `❌ Error: ${err.response?.data?.message || err.message}`, embeds: [], components: [] });
                        collector.stop();
                    }
                } else {
                    await i.deferUpdate();
                    embed.setDescription(`**Wager:** ${selectedWager ? `${selectedWager} Gems` : 'Not set'}\n**Map:** ${selectedMap ? gameData.maps.find(m=>m.id === selectedMap).name : 'Not set'}`);
                    await interaction.editReply({ embeds: [embed] });
                }
            });

            collector.on('end', collected => {
                if (collected.size === 0) {
                    interaction.editReply({ content: 'Challenge creation timed out.', embeds: [], components: [] });
                }
            });

        } catch (error) {
            const errorMessage = error.response?.data?.message || 'An error occurred during the pre-check.';
            await interaction.editReply({ content: `❌ ${errorMessage}`, embeds: [], components: [] });
        }
    },
};
