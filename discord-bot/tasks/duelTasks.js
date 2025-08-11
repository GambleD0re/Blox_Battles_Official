const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { getGameData } = require('../utils/gameData');
const { DUEL_RESULTS_CHANNEL_ID, FRONTEND_URL, DUELER_ROLE_ID } = process.env;

async function handleDuelResult(client, task) {
    const { duelId, winner, loser, wager, pot, mapName, finalScores, playerLoadouts } = task.payload;
    const gameData = getGameData();

    const winnerLoadout = playerLoadouts?.[winner.username]?.map(wId => gameData.weapons.find(w => w.name === wId)?.name || wId).join(', ') || 'N/A';
    const loserLoadout = playerLoadouts?.[loser.username]?.map(wId => gameData.weapons.find(w => w.name === wId)?.name || wId).join(', ') || 'N/A';

    const embed = new EmbedBuilder()
        .setColor(0x3fb950)
        .setTitle(`⚔️ Duel Result: ${winner.username} vs. ${loser.username}`)
        .setURL(`${FRONTEND_URL}/transcripts/${duelId}`)
        .setThumbnail(winner.avatarUrl || `https://www.roblox.com/headshot-thumbnail/image?userId=${winner.robloxId}&width=150&height=150&format=png`)
        .addFields(
            { name: '🏆 Winner', value: `**${winner.username}**\n💰 **+${pot.toLocaleString()}** Gems`, inline: true },
            { name: '💔 Loser', value: `**${loser.username}**\n💸 **-${wager.toLocaleString()}** Gems`, inline: true },
            { name: '📊 Score & Map', value: `\`${finalScores ? Object.values(finalScores).join(' - ') : 'N/A'}\` on **${mapName}**`, inline: false },
            { name: `${winner.username}'s Loadout`, value: `\`\`\`${winnerLoadout}\`\`\``, inline: true },
            { name: `${loser.username}'s Loadout`, value: `\`\`\`${loserLoadout}\`\`\``, inline: true }
        )
        .setTimestamp()
        .setFooter({ text: `Duel ID: ${duelId}` });

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setLabel('View Full Transcript')
            .setStyle(ButtonStyle.Link)
            .setURL(`${FRONTEND_URL}/transcripts/${duelId}`)
    );

    const channel = await client.channels.fetch(DUEL_RESULTS_CHANNEL_ID).catch(() => null);
    if (!channel) {
        throw new Error(`Duel results channel with ID ${DUEL_RESULTS_CHANNEL_ID} not found.`);
    }

    await channel.send({ embeds: [embed], components: [row] });
}

async function handleDmNotification(client, task, type) {
    const { payload } = task;
    let recipientId, embed, row;

    switch (type) {
        case 'link_success':
            recipientId = payload.discordId;
            embed = new EmbedBuilder()
                .setColor(0x3fb950)
                .setTitle('✅ Account Linked')
                .setDescription('Your Blox Battles account has been successfully linked to this Discord account!');
            
            if (DUELER_ROLE_ID) {
                try {
                    const guild = client.guilds.cache.first();
                    const member = await guild.members.fetch(recipientId);
                    if (member) {
                        await member.roles.add(DUELER_ROLE_ID);
                        console.log(`[ROLES] Assigned Dueler role to ${member.user.tag}`);
                    }
                } catch (roleError) {
                    console.error(`[ROLES] Failed to assign Dueler role to user ${recipientId}:`, roleError.message);
                }
            }
            break;
        case 'duel_challenge':
            recipientId = payload.recipientDiscordId;
            embed = new EmbedBuilder()
                .setColor(0x58a6ff)
                .setTitle('⚔️ You Have Been Challenged!')
                .setDescription(`**${payload.challengerUsername}** has challenged you to a duel.`)
                .addFields(
                    { name: 'Wager', value: `${payload.wager.toLocaleString()} Gems`, inline: true },
                    { name: 'Map', value: payload.mapName, inline: true }
                );
            row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setLabel('View on Dashboard').setStyle(ButtonStyle.Link).setURL(`${FRONTEND_URL}/dashboard`)
            );
            break;
        case 'duel_accepted':
            recipientId = payload.recipientDiscordId;
            embed = new EmbedBuilder()
                .setColor(0x3fb950)
                .setTitle('✅ Challenge Accepted!')
                .setDescription(`**${payload.opponentUsername}** has accepted your challenge. The duel is now ready to start from your inbox.`)
                .setFooter({ text: `Duel ID: ${payload.duelId}` });
            row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setLabel('Go to Dashboard').setStyle(ButtonStyle.Link).setURL(`${FRONTEND_URL}/dashboard`)
            );
            break;
        case 'duel_started':
            recipientId = payload.recipientDiscordId;
            embed = new EmbedBuilder()
                .setColor(0xf85149)
                .setTitle('🔥 Your Duel Has Started!')
                .setDescription(`**${payload.starterUsername}** has started the duel. Join the server now!`)
                .setFooter({ text: `Duel ID: ${payload.duelId}` });
            row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setLabel('Join Server').setStyle(ButtonStyle.Link).setURL(payload.serverLink)
            );
            break;
        default:
            throw new Error(`Unknown DM notification type: ${type}`);
    }

    if (!recipientId) throw new Error(`Recipient ID not found for DM type ${type}`);

    try {
        const user = await client.users.fetch(recipientId);
        const components = row ? [row] : [];
        await user.send({ embeds: [embed.setTimestamp()], components });
    } catch (dmError) {
        console.warn(`[DMs] Failed to send '${type}' DM to user ${recipientId}. They may have DMs disabled. Error: ${dmError.message}`);
    }
}

module.exports = {
    handleDuelResult,
    handleDmNotification,
};
