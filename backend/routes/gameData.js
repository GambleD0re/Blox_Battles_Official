// backend/routes/gameData.js
// This file provides an endpoint for fetching static game data like maps and weapons.

const express = require('express');
const router = express.Router();
const GAME_DATA = require('../game-data-store.js'); // Import from the new central store

// Endpoint for the frontend to fetch all game data
router.get('/', (req, res) => {
    res.json(GAME_DATA);
});

module.exports = router;
