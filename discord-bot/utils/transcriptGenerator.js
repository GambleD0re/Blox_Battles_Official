const { Collection } = require('discord.js');

async function generateTranscript(channel) {
    let content = `Transcript for ticket channel #${channel.name}\nGenerated on: ${new Date().toUTCString()}\n\n`;
    let lastMessageId;
    const messages = new Collection();

    while (true) {
        const fetchedMessages = await channel.messages.fetch({
            limit: 100,
            before: lastMessageId,
        });

        if (fetchedMessages.size === 0) {
            break;
        }

        fetchedMessages.forEach(msg => messages.set(msg.id, msg));
        lastMessageId = fetchedMessages.lastKey();
    }

    const sortedMessages = Array.from(messages.values()).sort((a, b) => a.createdTimestamp - b.createdTimestamp);

    for (const msg of sortedMessages) {
        const timestamp = new Date(msg.createdTimestamp).toLocaleString('en-US', { timeZone: 'UTC' });
        content += `[${timestamp}] ${msg.author.tag}: ${msg.content}\n`;

        if (msg.attachments.size > 0) {
            msg.attachments.forEach(att => {
                content += `[Attachment: ${att.name}](${att.url})\n`;
            });
        }
    }

    return content;
}

module.exports = { generateTranscript };
