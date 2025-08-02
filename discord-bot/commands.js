// discord-bot/deploy-commands.js
require('dotenv').config();
const { REST, Routes } = require('discord.js');

const { DISCORD_BOT_TOKEN, DISCORD_CLIENT_ID, DISCORD_GUILD_ID } = process.env;

if (!DISCORD_BOT_TOKEN || !DISCORD_CLIENT_ID || !DISCORD_GUILD_ID) {
    console.error("FATAL: Missing required Discord environment variables (TOKEN, CLIENT_ID, GUILD_ID) for command deployment.");
    process.exit(1);
}

const commands = [
    {
        name: 'link',
        description: 'Link your Discord account to your Blox Battles account.',
    },
];

const rest = new REST({ version: '10' }).setToken(DISCORD_BOT_TOKEN);

(async () => {
    try {
        console.log('Started refreshing application (/) commands for the guild.');

        await rest.put(
            Routes.applicationGuildCommands(DISCORD_CLIENT_ID, DISCORD_GUILD_ID),
            { body: commands },
        );

        console.log('Successfully reloaded application (/) commands.');
    } catch (error) {
        console.error(error);
    }
})();
