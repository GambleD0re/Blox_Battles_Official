const WebSocket = require('ws');

const initializeWebSocket = (server) => {
    const wss = new WebSocket.Server({ server });

    wss.on('connection', (ws) => {
        console.log('[WebSocket] Client connected. Total clients:', wss.clients.size);
        ws.on('close', () => {
            console.log('[WebSocket] Client disconnected. Total clients:', wss.clients.size);
        });
        ws.on('error', (error) => {
            console.error('[WebSocket] An error occurred:', error);
        });
    });

    console.log('[WebSocket] Server initialized and listening.');
    return wss; // Return the instance
};

const broadcast = (wss, data) => {
    if (!wss) {
        console.error('[WebSocket] Broadcast failed: WebSocket server instance is invalid.');
        return;
    }

    const payload = JSON.stringify(data);
    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(payload);
        }
    });
};

module.exports = {
    initializeWebSocket,
    broadcast,
};
