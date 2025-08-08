// discord-bot/utils/gameData.js
const { apiClient } = require('./apiClient');

let gameData = {
    maps: [],
    weapons: [],
    regions: [],
};

async function cacheGameData() {
    try {
        const response = await apiClient.get('/gamedata');
        gameData = response.data;
        console.log(`[GameData] Successfully cached game data: ${gameData.maps.length} maps, ${gameData.weapons.length} weapons, ${gameData.regions.length} regions.`);
    } catch (error) {
        console.error("[GameData] Failed to cache game data:", error.response?.data?.message || error.message);
        // We throw here because many bot functions depend on this data.
        throw new Error("Could not initialize game data cache.");
    }
}

function getGameData() {
    return gameData;
}

module.exports = {
    cacheGameData,
    getGameData,
};
