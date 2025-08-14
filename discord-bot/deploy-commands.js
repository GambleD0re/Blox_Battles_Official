require('dotenv').config();
const { REST, Routes, ApplicationCommandOptionType } = require('discord.js');

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
    {
        name: 'unlink',
        description: 'Unlink your Discord account from your Blox Battles account.',
    },
    {
        name: 'challenge',
        description: 'Challenge another player to a duel using an interactive builder.',
        options: [
            {
                name: 'opponent',
                type: ApplicationCommandOptionType.User,
                description: 'The user you want to challenge',
                required: true,
            },
        ],
    },
    {
        name: 'ticket',
        description: 'Create a new support ticket or appeal.',
    },
    // *** NEW COMMAND DEFINITION ***
    {
        name: 'reactionrole',
        description: 'Manage reaction roles for the server.',
        // This command should be for administrators only.
        // The permission is checked in the command file, but setting default permissions is good practice.
        default_member_permissions: String(1 << 3), // Administrator permission bit
        dm_permission: false,
        options: [
            {
                name: 'setup',
                description: 'Creates a new message/embed for reaction roles.',
                type: ApplicationCommandOptionType.Subcommand,
                options: [
                    { name: 'channel', description: 'The channel to send the reaction role message to.', type: ApplicationCommandOptionType.Channel, required: true },
                    { name: 'title', description: 'The title of the embed message.', type: ApplicationCommandOptionType.String, required: true },
                    { name: 'description', description: 'The main text of the embed message. Use "\\n" for new lines.', type: ApplicationCommandOptionType.String, required: true },
                    { name: 'color', description: 'A hex color code for the embed (e.g., #58a6ff).', type: ApplicationCommandOptionType.String, required: false },
                ]
            },
            {
                name: 'add',
                description: 'Adds a role-to-emoji mapping to a reaction role message.',
                type: ApplicationCommandOptionType.Subcommand,
                options: [
                    { name: 'message_id', description: 'The message ID of the reaction role embed.', type: ApplicationCommandOptionType.String, required: true },
                    { name: 'emoji', description: 'The emoji to react with (can be a custom emoji).', type: ApplicationCommandOptionType.String, required: true },
                    { name: 'role', description: 'The role to assign when the user reacts.', type: ApplicationCommandOptionType.Role, required: true },
                ]
            },
            {
                name: 'remove',
                description: 'Removes a role-to-emoji mapping from a reaction role message.',
                type: ApplicationCommandOptionType.Subcommand,
                options: [
                    { name: 'message_id', description: 'The message ID of the reaction role embed.', type: ApplicationCommandOptionType.String, required: true },
                    { name: 'emoji', description: 'The emoji of the rule to remove.', type: ApplicationCommandOptionType.String, required: true },
                ]
            },
            {
                name: 'list',
                description: 'Lists all configured reaction roles for a specific message.',
                type: ApplicationCommandOptionType.Subcommand,
                options: [
                    { name: 'message_id', description: 'The message ID of the reaction role embed.', type: ApplicationCommandOptionType.String, required: true },
                ]
            }
        ]
    },
];

const rest = new REST({ version: '10' }).setToken(DISCORD_BOT_TOKEN);

(async () => {
    try {
        console.log(`Started refreshing ${commands.length} application (/) commands for the specified guild.`);
        console.log("This process will overwrite all existing commands in this guild with the set defined in this script.");

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
