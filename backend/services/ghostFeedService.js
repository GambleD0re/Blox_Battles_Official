const fetch = require('node-fetch');
const { broadcast } = require('../webSocketManager');

const GHOST_FEED_INTERVAL = 4000;
let ghostFeedTimer = null;
let wssInstance = null; // To hold the WebSocket server instance

const WAGERS = [100, 250, 500, 1000, 2500];

async function getRandomRobloxUser() {
    while (true) {
        try {
            const randomId = Math.floor(Math.random() * 3000000000) + 1;
            
            const userApiUrl = `https://users.roblox.com/v1/users/${randomId}`;
            const userResponse = await fetch(userApiUrl);
            if (!userResponse.ok) continue;
            const userData = await userResponse.json();
            if (userData.isBanned || !userData.name) continue;

            const thumbApiUrl = `https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${randomId}&size=150x150&format=Png&isCircular=false`;
            const thumbResponse = await fetch(thumbApiUrl);
            if (!thumbResponse.ok) continue;
            const thumbData = await thumbResponse.json();
            
            const avatarUrl = thumbData.data?.[0]?.imageUrl || null;

            return {
                username: userData.name,
                avatarUrl: avatarUrl,
            };

        } catch (error) {
            console.warn('[GhostFeed] Error fetching random Roblox user, trying again.', error.message);
        }
    }
}

async function generateGhostDuel() {
    try {
        console.log('[GhostFeed] No real duels detected. Generating a ghost duel...');
        const [player1, player2] = await Promise.all([getRandomRobloxUser(), getRandomRobloxUser()]);

        const winner = Math.random() < 0.5 ? player1 : player2;
        const loser = winner === player1 ? player2 : player1;
        
        const wager = WAGERS[Math.floor(Math.random() * WAGERS.length)];
        const pot = wager * 2 - Math.ceil(wager * 2 * 0.04);
        const loserScore = Math.floor(Math.random() * 5);

        const ghostDuelPayload = {
            id: `ghost-${Date.now()}`,
            winner: winner,
            loser: loser,
            score: { winnerScore: 5, loserScore: loserScore },
            wager: wager,
            pot: pot,
        };

        // Pass the wss instance to the broadcast function
        broadcast(wssInstance, {
            type: 'live_feed_update',
            payload: ghostDuelPayload
        });

        console.log(`[GhostFeed] Broadcasted ghost duel: ${winner.username} vs ${loser.username}`);

    } catch (error) {
        console.error('[GhostFeed] Failed to generate ghost duel:', error);
    }
}

const resetGhostFeedTimer = () => {
    if (ghostFeedTimer) {
        clearTimeout(ghostFeedTimer);
    }
    ghostFeedTimer = setTimeout(generateGhostDuel, GHOST_FEED_INTERVAL);
};

// Accept the wss instance when starting the service
const startGhostFeed = (wss) => {
    wssInstance = wss; // Store the instance for later use
    console.log('[GhostFeed] Service started. Initializing first timer.');
    resetGhostFeedTimer();
};

module.exports = {
    startGhostFeed,
    resetGhostFeedTimer, // You'll need to adapt how this is called if real duels are added
};
