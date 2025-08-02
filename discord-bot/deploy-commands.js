// discord-bot/deploy-commands.js
require('dotenv').config();
const { REST, Routes } = require('discord.js');

const { DISCORD_BOT_TOKEN, DISCORD_CLIENT_ID, DISCORD_GUILD_ID } = process.env;

if (!DISCORD_BOT_TOKEN || !DISCORD_CLIENT_ID || !DISCORD_GUILD_ID) {
    console.error("FATAL: Missing required Discord environment variables (TOKEN, CLIENT_ID, GUILD_ID) for command deployment.");
    process.exit(1);
}

// This array defines all the commands your bot will have in this specific guild.
// If you want to remove a command, simply delete it from this array and re-run the script.
const commands = [
    {
        name: 'link',
        description: 'Link your Discord account to your Blox Battles account.',
        // By default, guild commands are not available in DMs.
    },
    // You can add other guild-specific commands here in the future.
];

const rest = new REST({ version: '10' }).setToken(DISCORD_BOT_TOKEN);

(async () => {
    try {
        console.log(`Started refreshing ${commands.length} application (/) commands for the specified guild.`);
        console.log("This process will overwrite all existing commands in this guild with the set defined in this script, effectively clearing any old ones.");

        // The 'put' method completely replaces all commands in the guild with the new set.
        // This is the standard and correct way to "clear and update" commands.
        // If you passed an empty array to 'body', it would unregister all commands.
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
