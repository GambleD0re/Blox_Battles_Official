--- START OF FILE matchmakingService.js ---
// backend/services/matchmakingService.js
const db = require('../database/database');
const GAME_DATA = require('../game-data-store');
const { sendToUser } = require('../webSocketManager');

const MATCHMAKING_INTERVAL_SECONDS = 5;

const findAndProcessMatches = async () => {
    const pool = db.getPool();
    const waitingPlayers = await pool.query('SELECT * FROM random_queue_entries ORDER BY created_at ASC');
    if (waitingPlayers.rows.length < 2) return;

    const groupedByQueue = waitingPlayers.rows.reduce((acc, player) => {
        const key = `${player.region}_${player.wager}`;
        if (!acc[key]) {
            acc[key] = [];
        }
        acc[key].push(player);
        return acc;
    }, {});

    for (const key in groupedByQueue) {
        const players = groupedByQueue[key];
        while (players.length >= 2) {
            const player1 = players.shift();
            const player2 = players.shift();
            
            const client = await pool.connect();
            try {
                const { rows: [server] } = await client.query(`
                    SELECT server_id, join_link FROM game_servers
                    WHERE region = $1 AND player_count < 40 AND last_heartbeat >= NOW() - INTERVAL '60 seconds'
                    ORDER BY player_count ASC LIMIT 1 FOR UPDATE
                `, [player1.region]);
                
                if (!server) {
                    players.unshift(player2, player1);
                    break; 
                }

                await client.query('BEGIN');
                
                const { rows: [p1Data] } = await client.query('SELECT gems FROM users WHERE id = $1 FOR UPDATE', [player1.user_id]);
                const { rows: [p2Data] } = await client.query('SELECT gems FROM users WHERE id = $1 FOR UPDATE', [player2.user_id]);

                if (p1Data.gems < player1.wager || p2Data.gems < player2.wager) {
                    await client.query('ROLLBACK');
                    console.log(`[Matchmaking] Match between ${player1.user_id} and ${player2.user_id} failed due to insufficient funds.`);
                    continue;
                }
                
                await client.query('UPDATE users SET gems = gems - $1 WHERE id = $2', [player1.wager, player1.user_id]);
                await client.query('UPDATE users SET gems = gems - $1 WHERE id = $2', [player2.wager, player2.user_id]);

                await client.query('DELETE FROM random_queue_entries WHERE user_id = ANY($1::uuid[])', [[player1.user_id, player2.user_id]]);
                
                const combinedBans = [...new Set([...player1.banned_weapons, ...player2.banned_weapons])];
                const availableMaps = GAME_DATA.maps.filter(m => m.id !== player1.banned_map && m.id !== player2.banned_map);
                const selectedMap = availableMaps[Math.floor(Math.random() * availableMaps.length)];
                
                const totalPot = player1.wager * 2;
                const taxCollected = Math.ceil(totalPot * 0.01);
                const finalPot = totalPot - taxCollected;

                const { rows: [newDuel] } = await client.query(
                    `INSERT INTO duels (challenger_id, opponent_id, wager, pot, tax_collected, banned_weapons, map, region, type, status, accepted_at, started_at, assigned_server_id, server_invite_link)
                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'random', 'started', NOW(), NOW(), $9, $10) RETURNING id`,
                    [player1.user_id, player2.user_id, player1.wager, finalPot, taxCollected, JSON.stringify(combinedBans), selectedMap.id, player1.region, server.server_id, server.join_link]
                );
                
                await client.query('UPDATE game_servers SET player_count = player_count + 2 WHERE server_id = $1', [server.server_id]);

                const { rows: [p1Info] } = await client.query('SELECT linked_roblox_username FROM users WHERE id = $1', [player1.user_id]);
                const { rows: [p2Info] } = await client.query('SELECT linked_roblox_username FROM users WHERE id = $1', [player2.user_id]);
                
                const taskPayload = {
                    websiteDuelId: newDuel.id,
                    serverId: server.server_id,
                    serverLink: server.join_link,
                    challenger: p1Info.linked_roblox_username,
                    opponent: p2Info.linked_roblox_username,
                    map: selectedMap.name,
                    bannedWeapons: combinedBans.map(id => GAME_DATA.weapons.find(w => w.id === id)?.name || id),
                    wager: player1.wager,
                };
                await client.query("INSERT INTO tasks (task_type, payload) VALUES ('REFEREE_DUEL', $1)", [JSON.stringify(taskPayload)]);
                
                await client.query('COMMIT');
                
                console.log(`[Matchmaking] Match found and created! Duel ID: ${newDuel.id}`);
                const matchData = { type: 'match_found', payload: { serverLink: server.join_link, duelId: newDuel.id } };
                sendToUser(player1.user_id, matchData);
                sendToUser(player2.user_id, matchData);
            } catch (err) {
                await client.query('ROLLBACK');
                console.error('[Matchmaking] Transaction failed:', err);
            } finally {
                client.release();
            }
        }
    }
};

const startMatchmakingService = () => {
    console.log(`[Matchmaking] Service started. Checking for matches every ${MATCHMAKING_INTERVAL_SECONDS} seconds.`);
    setInterval(findAndProcessMatches, MATCHMAKING_INTERVAL_SECONDS * 1000);
};

module.exports = { startMatchmakingService };
