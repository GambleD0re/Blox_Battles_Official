// discord-bot/deploy-commands.js
require('dotenv').config();
const { REST, Routes } = require('discord.js');

const { DISCORD_BOT_TOKEN, DISCORD_CLIENT_ID, DISCORD_GUILD_ID } = process.env;

if (!DISCORD_BOT_TOKEN || !DISCORD_CLIENT_ID || !DISCORD_GUILD_ID) {
    console.error("FATAL: Missing required Discord environment variables (TOKEN, CLIENT_ID, GUILD_ID) for command deployment.");
    process.exit(1);
}

// [MODIFIED] Added the new /unlink command to the array.
const commands = [
    {
        name: 'link',
        description: 'Link your Discord account to your Blox Battles account.',
    },
    {
        name: 'unlink',
        description: 'Unlink your Discord account from your Blox Battles account.',
    },
];

const rest = new REST({ version: '10' }).setToken(DISCORD_BOT_TOKEN);

(async () => {
    try {
        console.log(`Started refreshing ${commands.length} application (/) commands for the specified guild.`);
        console.log("This process will overwrite all existing commands in this guild with the set defined in this script, effectively clearing any old ones.");

        const data = await rest.put(
            Routes.applicationGuildCommands(DISCORD_CLIENT_ID, DISCORD_GUILD_ID),
            { body: commands },
        );

        console.log(`Successfully reloaded ${data.length} application (/) commands for the guild.`);
        console.log("Changes should be visible in your Discord server immediately.");

    } catch (error) {
        console.error("An error occurred while deploying commands:", error);
    }
})();
