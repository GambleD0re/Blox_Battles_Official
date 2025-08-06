// backend/services/priceFeedService.js
// This service connects to Chainlink Price Feeds on the Polygon Mainnet
// to get real-time, reliable price data for cryptocurrencies.

const { ethers } = require('ethers');

// --- Configuration ---
const ALCHEMY_POLYGON_URL = process.env.ALCHEMY_POLYGON_URL;

const PRICE_FEED_ADDRESSES = {
    'MATIC_USD': '0xAB594600376Ec9fD91F8e885dADF0CE036862dE0',
    'USDC_USD': '0xfE4A8cc5b5B2366C1B58Bea3858e81843581b2F7',
    'USDT_USD': '0x0A6513e40db6EB1b165753AD52E80663aeA50545'
};

const PRICE_FEED_ABI = [
    {
        "inputs": [], "name": "latestRoundData", "outputs": [
            { "internalType": "uint80", "name": "roundId", "type": "uint80" },
            { "internalType": "int256", "name": "answer", "type": "int256" },
            { "internalType": "uint256", "name": "startedAt", "type": "uint256" },
            { "internalType": "uint256", "name": "updatedAt", "type": "uint256" },
            { "internalType": "uint80", "name": "answeredInRound", "type": "uint80" }
        ], "stateMutability": "view", "type": "function"
    },
    {
        "inputs": [], "name": "decimals", "outputs": [{ "internalType": "uint8", "name": "", "type": "uint8" }], "stateMutability": "view", "type": "function"
    }
];

// --- Service State ---
let provider;
let isInitialized = false;

function initializePriceFeedService() {
    if (!ALCHEMY_POLYGON_URL) {
        console.error("FATAL ERROR: ALCHEMY_POLYGON_URL must be set in .env to use the Price Feed Service.");
        throw new Error("Missing ALCHEMY_POLYGON_URL environment variable.");
    }
    try {
        provider = new ethers.JsonRpcProvider(ALCHEMY_POLYGON_URL);
        isInitialized = true;
        console.log("Price Feed Service Initialized successfully.");
    } catch (error) {
        console.error("Failed to initialize Price Feed Service:", error);
        throw error;
    }
}

/**
 * Fetches the latest USD price for a given token.
 * @param {string} tokenSymbol The symbol of the token ('POL_USD', 'USDC_USD', 'USDT_USD').
 * @returns {Promise<number>} The latest price in USD.
 */
async function getLatestPrice(tokenSymbol) {
    if (!isInitialized) {
        throw new Error("Price Feed Service is not initialized.");
    }

    const feedSymbol = tokenSymbol === 'POL_USD' ? 'MATIC_USD' : tokenSymbol;
    const address = PRICE_FEED_ADDRESSES[feedSymbol];
    if (!address) {
        throw new Error(`Invalid token symbol provided: ${tokenSymbol}`);
    }

    try {
        console.log(`[PriceFeed] Fetching price for ${feedSymbol} using address ${address}...`);
        
        // [FIXED] The arguments for the ethers.Contract constructor were in the wrong order.
        // It should be (address, abi, provider).
        const priceFeed = new ethers.Contract(address, PRICE_FEED_ABI, provider);
        
        const roundData = await priceFeed.latestRoundData();
        const decimals = await priceFeed.decimals();
        
        const price = Number(roundData.answer) / (10**Number(decimals));
        
        console.log(`[PriceFeed] Successfully fetched price for ${feedSymbol}: $${price}`);
        return price;

    } catch (error) {
        console.error(`[PriceFeed] CRITICAL: Failed to fetch price for ${tokenSymbol}:`, error);
        throw new Error(`Could not retrieve the latest price for ${tokenSymbol}.`);
    }
}

// Initialize on load
try {
    initializePriceFeedService();
} catch (e) {
    console.warn("Price Feed Service initialization failed. Price quotes will not be available.", e.message);
}

module.exports = {
    getLatestPrice
};
