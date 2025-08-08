// discord-bot/events/ready.js
const { Events } = require('discord.js');
const { cacheGameData } = require('../utils/gameData');
const { startTaskProcessor } = require('../tasks/taskProcessor');
const { startStatusUpdaters } = require('../utils/statusUpdater');

module.exports = {
    name: Events.ClientReady,
    once: true,
    async execute(client) {
        console.log(`Bot logged in as ${client.user.tag}!`);

        try {
            await cacheGameData();
            startTaskProcessor(client);
            startStatusUpdaters(client);
            console.log("Bot initialization complete. Systems are running.");
        } catch (error) {
            console.error("A critical error occurred during bot initialization:", error);
        }
    },
};
