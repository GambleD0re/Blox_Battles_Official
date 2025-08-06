// backend/services/hdWalletService.js
// This service manages the creation of unique deposit addresses for users
// using a Hierarchical Deterministic (HD) Wallet structure.

const { ethers } = require('ethers');

// --- Configuration ---
// This master public key (xpub) must be set in your .env file.
// It is derived from your master private key but cannot be used to spend funds.
const MASTER_XPUB = process.env.MASTER_XPUB;

// --- Service State ---
let masterNode;
let isInitialized = false;

/**
 * Initializes the HD Wallet service by creating a master node from the xpub key.
 * @throws {Error} if the MASTER_XPUB environment variable is not set.
 */
function initializeHdWalletService() {
    if (!MASTER_XPUB) {
        console.error("FATAL ERROR: MASTER_XPUB must be set in .env to generate deposit addresses.");
        throw new Error("Missing MASTER_XPUB environment variable.");
    }

    try {
        // Create an HD node from the extended public key.
        // This node can be used to derive child public keys and addresses, but not private keys.
        masterNode = ethers.HDNodeWallet.fromExtendedKey(MASTER_XPUB);
        isInitialized = true;
        console.log("HD Wallet Service Initialized successfully.");
    } catch (error) {
        console.error("Failed to initialize HD Wallet Service. Check if MASTER_XPUB is valid.", error);
        throw error;
    }
}

/**
 * Derives a unique, permanent deposit address for a given user ID.
 * The derivation path is standardized to ensure consistency.
 * @param {number | string} userId The user's unique numerical ID from your database.
 * @returns {string} The user's unique deposit address.
 * @throws {Error} if the service is not initialized.
 */
function getUserDepositAddress(userId) {
    if (!isInitialized) {
        throw new Error("HD Wallet Service is not initialized.");
    }
    
    // [FIX] The derivation path for an xpub key must be relative, not absolute.
    // The "m/" prefix is only used for the master private key. Since we are using an
    // extended public key (xpub), we derive relatively from the current node.
    const derivationPath = `0/${userId}`;
    const userNode = masterNode.derivePath(derivationPath);
    
    return userNode.address;
}

// Initialize the service on module load.
try {
    initializeHdWalletService();
} catch (e) {
    console.warn("HD Wallet Service initialization failed. Deposit address generation will not be available.", e.message);
}

module.exports = {
    getUserDepositAddress
};