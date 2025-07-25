// backend/routes/payments.js
const express = require('express');
const { body } = require('express-validator');
const { authenticateToken, handleValidationErrors } = require('../middleware/auth');
const db = require('../database/database');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { getUserDepositAddress } = require('../services/hdWalletService');
const { getLatestPrice } = require('../services/priceFeedService');
const { addAddressToMonitor } = require('../services/transactionListenerService');

const router = express.Router();

// GEM PACKAGES are defined on the server to prevent client-side manipulation.
const GEM_PACKAGES = {
    '500_gems': { name: '500 Gems', usdValue: 500, gem_amount: 500 },
    '1000_gems': { name: '1,000 Gems', usdValue: 1000, gem_amount: 1000 },
    '1500_gems': { name: '1,500 Gems', usdValue: 1500, gem_amount: 1500 },
    '2500_gems': { name: '2,500 Gems', usdValue: 2500, gem_amount: 2500 },
    '5000_gems': { name: '5,000 Gems', usdValue: 5000, gem_amount: 5000 },
    '10000_gems': { name: '10,000 Gems', usdValue: 10000, gem_amount: 10000 },
};

// Create a Stripe Checkout session
router.post('/create-checkout-session',
    authenticateToken,
    body('packageId').isIn(Object.keys(GEM_PACKAGES)),
    handleValidationErrors,
    async (req, res) => {
        try {
            const { packageId } = req.body;
            const user = req.user;
            const selectedPackage = GEM_PACKAGES[packageId];

            const session = await stripe.checkout.sessions.create({
                payment_method_types: ['card'],
                line_items: [{
                    price_data: {
                        currency: 'usd',
                        product_data: { name: selectedPackage.name },
                        unit_amount: selectedPackage.usdValue,
                    },
                    quantity: 1,
                }],
                mode: 'payment',
                metadata: {
                    userId: user.userId,
                    gemAmount: selectedPackage.gem_amount,
                },
                success_url: `${process.env.SERVER_URL}/deposit?success=true`,
                cancel_url: `${process.env.SERVER_URL}/deposit?canceled=true`,
            });

            res.json({ id: session.id });

        } catch (error) {
            console.error("Stripe Session Error:", error);
            res.status(500).json({ message: 'Failed to create payment session.' });
        }
    }
);

// Get or generate a unique crypto deposit address for a user.
router.get('/crypto-address', authenticateToken, async (req, res) => {
    const userId = req.user.userId;
    try {
        const { rows: [user] } = await db.query('SELECT user_index, crypto_deposit_address FROM users WHERE id = $1', [userId]);
        if (!user) {
            return res.status(404).json({ message: 'User not found.' });
        }

        if (user.crypto_deposit_address) {
            return res.status(200).json({ address: user.crypto_deposit_address });
        }
        
        const userIndex = user.user_index;
        const newAddress = getUserDepositAddress(userIndex);

        await db.query('UPDATE users SET crypto_deposit_address = $1 WHERE id = $2', [newAddress, userId]);
        
        addAddressToMonitor(newAddress);
        res.status(200).json({ address: newAddress });

    } catch (error) {
        console.error("Crypto Address Generation Error:", error);
        res.status(500).json({ message: 'Failed to get or generate a deposit address.' });
    }
});

// Get a real-time quote for a crypto deposit.
router.post('/crypto-quote',
    authenticateToken,
    [
        body('packageId').isIn(Object.keys(GEM_PACKAGES)).withMessage('Invalid package ID.'),
        body('tokenType').isIn(['USDC', 'USDT', 'POL']).withMessage('Invalid token type.')
    ],
    handleValidationErrors,
    async (req, res) => {
        const { packageId, tokenType } = req.body;
        try {
            const selectedPackage = GEM_PACKAGES[packageId];
            const packageUsdValue = selectedPackage.usdValue / 100; // Convert cents to dollars

            const priceSymbol = `${tokenType}_USD`;
            const currentPrice = await getLatestPrice(priceSymbol);

            if (!currentPrice || currentPrice <= 0) {
                throw new Error(`Could not fetch a valid price for ${tokenType}`);
            }

            const cryptoAmount = packageUsdValue / currentPrice;

            res.status(200).json({
                packageId: packageId,
                tokenType: tokenType,
                usdValue: packageUsdValue,
                cryptoAmount: cryptoAmount.toFixed(6), // Keep precision for crypto
                quoteExpiration: Date.now() + 15 * 60 * 1000
            });

        } catch (error) {
            console.error(`Crypto Quote Error for ${tokenType}:`, error);
            res.status(500).json({ message: `Failed to generate a deposit quote for ${tokenType}.` });
        }
    }
);

module.exports = router;
