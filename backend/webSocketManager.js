const WebSocket = require('ws');

let wss;
// This array will hold the last 2 duel results for new connections.
let recentDuels = [];

const initializeWebSocket = (server) => {
    wss = new WebSocket.Server({ server });

    wss.on('connection', (ws) => {
        console.log('[WebSocket] Client connected. Total clients:', wss.clients.size);

        // --- NEW ---
        // When a new client connects, immediately send them the current duel history.
        if (recentDuels.length > 0) {
            console.log('[WebSocket] Sending duel history to new client.');
            ws.send(JSON.stringify({ type: 'live_feed_history', payload: recentDuels }));
        }
        // --- END NEW ---

        ws.on('close', () => {
            // No need to find the client, the wss.clients Set handles it automatically.
            console.log('[WebSocket] Client disconnected. Total clients:', wss.clients.size);
        });

        ws.on('error', (error) => {
            console.error('[WebSocket] An error occurred:', error);
        });
    });

    console.log('[WebSocket] Server initialized and listening.');
    return wss;
};

const broadcast = (wss, data) => {
    if (!wss) {
        console.error('[WebSocket] Broadcast failed: WebSocket server not initialized.');
        return;
    }

    // --- NEW ---
    // Before broadcasting, update the history with the latest duel payload.
    // Unshift adds the new duel to the beginning of the array.
    if (data.type === 'live_feed_update') {
        recentDuels.unshift(data.payload);
        // Ensure the history never contains more than 2 duels.
        if (recentDuels.length > 2) {
            recentDuels = recentDuels.slice(0, 2);
        }
    }
    // --- END NEW ---

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
