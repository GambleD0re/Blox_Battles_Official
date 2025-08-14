const { Events } = require('discord.js');
const { apiClient } = require('../utils/apiClient');

module.exports = {
    name: Events.MessageReactionAdd,
    async execute(reaction, user) {
        // Ignore reactions from bots
        if (user.bot) {
            return;
        }

        // Handle partials - fetch the full reaction object if it's not cached
        if (reaction.partial) {
            try {
                await reaction.fetch();
            } catch (error) {
                console.error('Failed to fetch partial reaction:', error);
                return;
            }
        }
        
        // Get a consistent identifier for the emoji (custom ID or unicode name)
        const emojiId = reaction.emoji.id || reaction.emoji.name;

        try {
            // Check the backend to see if this reaction corresponds to a rule
            const response = await apiClient.get('/discord/reaction-roles/lookup', {
                params: {
                    messageId: reaction.message.id,
                    emojiId: emojiId
                }
            });
            
            const roleId = response.data.roleId;
            if (!roleId) return;

            const member = await reaction.message.guild.members.fetch(user.id);
            if (!member) return;

            const role = await reaction.message.guild.roles.fetch(roleId);
            if (!role) {
                console.warn(`[ReactionRoles] Role with ID ${roleId} not found in guild ${reaction.message.guild.id}.`);
                return;
            }

            // Safety check: ensure bot can manage the role
            if (role.position >= reaction.message.guild.members.me.roles.highest.position) {
                console.warn(`[ReactionRoles] Cannot assign role ${role.name} (${role.id}) because it is higher than or equal to my own.`);
                return;
            }

            await member.roles.add(role);

        } catch (error) {
            // A 404 error from the API is expected and normal, it means no rule was found.
            if (error.response && error.response.status === 404) {
                return;
            }
            // Log other, unexpected errors.
            console.error('Error in messageReactionAdd event:', error.response?.data?.message || error.message);
        }
    },
};
