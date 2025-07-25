// backend/game-data-store.js
// This file acts as a central repository for static game data.

const GAME_DATA = {
    maps: [
        { id: 'arena', name: 'Arena' },
        { id: 'backrooms', name: 'Backrooms' },
        { id: 'battleground', name: 'Battleground' },
        { id: 'big_arena', name: 'Big Arena' },
        { id: 'big_backrooms', name: 'Big Backrooms' },
        { id: 'big_crossroads', name: 'Big Crossroads' },
        { id: 'big_graveyard', name: 'Big Graveyard' },
        { id: 'big_splash', name: 'Big Splash' },
        { id: 'boss_arena', name: 'Boss Arena' },
        { id: 'bridge', name: 'Bridge' },
        { id: 'construction', name: 'Construction' },
        { id: 'crossroads', name: 'Crossroads' },
        { id: 'docks', name: 'Docks' },
        { id: 'graveyard', name: 'Graveyard' },
        { id: 'legacy_big_splash', name: 'Legacy Big Splash' },
        { id: 'legacy_docks', name: 'Legacy Docks' },
        { id: 'legacy_onyx', name: 'Legacy Onyx' },
        { id: 'onyx', name: 'Onyx' },
        { id: 'playground', name: 'Playground' },
        { id: 'shooting_range', name: 'Shooting Range' },
        { id: 'splash', name: 'Splash' },
        { id: 'station', name: 'Station' },
    ],
    weapons: [
        { id: 'assault_rifle', name: 'Assault Rifle' },
        { id: 'bow', name: 'Bow' },
        { id: 'burst_rifle', name: 'Burst Rifle' },
        { id: 'flamethrower', name: 'Flamethrower' },
        { id: 'grenade_launcher', name: 'Grenade Launcher' },
        { id: 'minigun', name: 'Minigun' },
        { id: 'paintball_gun', name: 'Paintball Gun' },
        { id: 'rpg', name: 'RPG' },
        { id: 'shotgun', 'name': 'Shotgun' },
        { id: 'sniper_rifle', name: 'Sniper Rifle' },
        { id: 'exogun', name: 'Exogun' },
        { id: 'flare_gun', name: 'Flare Gun' },
    ]
};

module.exports = GAME_DATA;
