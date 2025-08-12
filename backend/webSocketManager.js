const WebSocket = require('ws');

let wss;
const clients = new Set();

const initializeWebSocket = (server) => {
    wss = new WebSocket.Server({ server });

    wss.on('connection', (ws) => {
        clients.add(ws);
        console.log('[WebSocket] Client connected. Total clients:', clients.size);

        ws.on('close', () => {
            clients.delete(ws);
            console.log('[WebSocket] Client disconnected. Total clients:', clients.size);
        });

        ws.on('error', (error) => {
            console.error('[WebSocket] An error occurred:', error);
            clients.delete(ws);
        });
    });

    console.log('[WebSocket] Server initialized and listening.');
};

const broadcast = (data) => {
    if (!wss) {
        console.error('[WebSocket] Broadcast failed: WebSocket server not initialized.');
        return;
    }

    const payload = JSON.stringify(data);
    clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(payload);
        }
    });
};

module.exports = {
    initializeWebSocket,
    broadcast,
};
