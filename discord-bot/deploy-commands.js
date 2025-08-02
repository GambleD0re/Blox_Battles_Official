// discord-bot/deploy-commands.js
require('dotenv').config();
const { REST, Routes } = require('discord.js');

const { DISCORD_BOT_TOKEN, DISCORD_CLIENT_ID, DISCORD_GUILD_ID } = process.env;

// [MODIFIED] Removed the GUILD_ID check as it's not needed for global commands.
if (!DISCORD_BOT_TOKEN || !DISCORD_CLIENT_ID) {
    console.error("FATAL: Missing required Discord environment variables (TOKEN, CLIENT_ID) for command deployment.");
    process.exit(1);
}

const commands = [
    {
        name: 'link',
        description: 'Link your Discord account to your Blox Battles account.',
        // [NEW] This property explicitly enables the command in DMs.
        dm_permission: true,
    },
];

const rest = new REST({ version: '10' }).setToken(DISCORD_BOT_TOKEN);

(async () => {
    try {
        console.log('Started refreshing application (/) GLOBAL commands.');

        // [MODIFIED] This line is changed from `applicationGuildCommands` to `applicationCommands`.
        // This registers the command globally instead of just for one server.
        await rest.put(
            Routes.applicationCommands(DISCORD_CLIENT_ID),
            { body: commands },
        );

        console.log('Successfully reloaded application (/) global commands.');
        console.warn('NOTE: Global commands may take up to an hour to propagate to all users and servers.');

    } catch (error) {
        console.error(error);
    }
})();
