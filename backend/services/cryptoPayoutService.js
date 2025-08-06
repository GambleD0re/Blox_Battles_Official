// backend/services/cryptoPayoutService.js
// This service handles direct interaction with the blockchain for sending cryptocurrency payouts.
// WARNING: This module directly handles a private key. Extreme care must be taken to secure it.

const ethers = require('ethers');

// --- Configuration ---
const ALCHEMY_POLYGON_URL = process.env.ALCHEMY_POLYGON_URL;
const PAYOUT_WALLET_PRIVATE_KEY = process.env.PAYOUT_WALLET_PRIVATE_KEY;

// [MODIFIED] Configuration object for supported ERC-20 tokens on the Polygon MAINNET.
const SUPPORTED_TOKENS = {
    'USDC': {
        // Official Polygon Mainnet USDC Address
        contractAddress: '0x3c499c542cef5e3811e1192ce70d8cc03d5c3359',
        decimals: 6
    },
    'USDT': {
        // Official Polygon Mainnet USDT Address
        contractAddress: '0xc2132d05d31c914a87c6611c10748aeb04b58e8f',
        decimals: 6
    }
};

const ERC20_ABI = [
    "function transfer(address to, uint256 amount) returns (bool)",
    "function decimals() view returns (uint8)"
];

// --- Service State ---
let provider;
let wallet;
let isInitialized = false;

/**
 * Initializes the blockchain provider and wallet signer on demand.
 */
async function ensureInitialized() {
    if (isInitialized) {
        return;
    }

    console.log("Attempting to initialize Crypto Payout Service for MAINNET...");

    if (!ALCHEMY_POLYGON_URL || !PAYOUT_WALLET_PRIVATE_KEY) {
        throw new Error("Missing required crypto environment variables in .env file.");
    }

    try {
        provider = new ethers.JsonRpcProvider(ALCHEMY_POLYGON_URL);
        wallet = new ethers.Wallet(PAYOUT_WALLET_PRIVATE_KEY, provider);
        
        isInitialized = true;
        console.log(`Crypto Payout Service Initialized Successfully for MAINNET. Wallet Address: ${wallet.address}`);

    } catch (error) {
        isInitialized = false;
        console.error("Failed to initialize Crypto Payout Service on demand:", error);
        throw new Error("Could not connect to the blockchain network. Please try again later.");
    }
}

/**
 * Sends a specified amount of a given token to a recipient address.
 * @param {string} recipientAddress The destination wallet address.
 * @param {number} amountUsd The amount of USD to send.
 * @param {string} tokenType The type of token to send ('USDC' or 'USDT').
 * @returns {Promise<string>} The transaction hash of the successful payout.
 */
async function sendCryptoPayout(recipientAddress, amountUsd, tokenType) {
    await ensureInitialized();

    const tokenConfig = SUPPORTED_TOKENS[tokenType];
    if (!tokenConfig) {
        throw new Error(`Unsupported token type: ${tokenType}`);
    }

    if (!ethers.isAddress(recipientAddress)) {
        throw new Error("Invalid recipient address provided.");
    }

    try {
        const contract = new ethers.Contract(tokenConfig.contractAddress, ERC20_ABI, wallet);
        const decimals = tokenConfig.decimals;
        const amountInSmallestUnit = ethers.parseUnits(amountUsd.toString(), decimals);

        console.log(`Attempting to send ${amountUsd} ${tokenType} (${amountInSmallestUnit.toString()} units) to ${recipientAddress} on MAINNET.`);

        // Estimate gas for the transaction to ensure it's viable
        await contract.transfer.estimateGas(recipientAddress, amountInSmallestUnit);
        
        // Execute the transfer.
        const tx = await contract.transfer(recipientAddress, amountInSmallestUnit);

        console.log(`${tokenType} MAINNET Payout transaction sent. Hash: ${tx.hash}`);
        
        return tx.hash;

    } catch (error) {
        console.error(`${tokenType} Payout Failed for address ${recipientAddress}:`, error);
        throw new Error(`Failed to process the ${tokenType} payout. The user's gems have not been debited.`);
    }
}

module.exports = {
    sendCryptoPayout
};
