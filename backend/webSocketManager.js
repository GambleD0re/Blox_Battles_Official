const WebSocket = require('ws');
const jwt = require('jsonwebtoken');

let wss;
const clients = new Map(); // Map<userId, WebSocket>
let recentDuels = [];

const initializeWebSocket = (server) => {
    wss = new WebSocket.Server({ server });

    wss.on('connection', (ws) => {
        console.log('[WebSocket] Client connected. Total clients:', wss.clients.size);
        ws.isAlive = true;
        ws.on('pong', () => { ws.isAlive = true; });

        ws.on('message', (message) => {
            try {
                const data = JSON.parse(message);
                if (data.type === 'auth' && data.token) {
                    const decoded = jwt.verify(data.token, process.env.JWT_SECRET);
                    const userId = decoded.userId;
                    clients.set(userId, ws);
                    ws.userId = userId;
                    console.log(`[WebSocket] Authenticated client for user: ${userId}`);
                    
                    if (recentDuels.length > 0) {
                        ws.send(JSON.stringify({ type: 'live_feed_history', payload: recentDuels }));
                    }
                }
            } catch (err) {
                console.warn('[WebSocket] Failed to authenticate client:', err.message);
                ws.terminate();
            }
        });

        ws.on('close', () => {
            if (ws.userId) {
                clients.delete(ws.userId);
                console.log(`[WebSocket] Client for user ${ws.userId} disconnected. Total clients:`, wss.clients.size);
            } else {
                console.log('[WebSocket] Unauthenticated client disconnected.');
            }
        });

        ws.on('error', (error) => {
            console.error('[WebSocket] An error occurred:', error);
        });
    });

    const interval = setInterval(() => {
        wss.clients.forEach((ws) => {
            if (ws.isAlive === false) return ws.terminate();
            ws.isAlive = false;
            ws.ping(() => {});
        });
    }, 30000);

    wss.on('close', () => {
        clearInterval(interval);
    });

    console.log('[WebSocket] Server initialized and listening.');
    return wss;
};

const broadcast = (data) => {
    if (!wss) {
        console.error('[WebSocket] Broadcast failed: WebSocket server not initialized.');
        return;
    }
    if (data.type === 'live_feed_update') {
        recentDuels.unshift(data.payload);
        if (recentDuels.length > 2) {
            recentDuels = recentDuels.slice(0, 2);
        }
    }
    const payload = JSON.stringify(data);
    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(payload);
        }
    });
};

const sendToUser = (userId, data) => {
    const client = clients.get(userId);
    if (client && client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify(data));
        console.log(`[WebSocket] Sent targeted message to user ${userId}.`);
        return true;
    }
    console.warn(`[WebSocket] Could not send targeted message: User ${userId} not connected.`);
    return false;
};

module.exports = {
    initializeWebSocket,
    broadcast,
    sendToUser,
};
