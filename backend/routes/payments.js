// START OF FILE backend/routes/payments.js ---
const express = require('express');
const { body } = require('express-validator');
const { authenticateToken, handleValidationErrors } = require('../middleware/auth');
const db = require('../database/database');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { getUserDepositAddress } = require('../services/hdWalletService');
const { getLatestPrice } = require('../services/priceFeedService');
const { addAddressToMonitor } = require('../services/transactionListenerService');

const router = express.Router();

const USD_TO_GEMS_RATE = parseInt(process.env.USD_TO_GEMS_RATE || '100', 10);
const MINIMUM_USD_DEPOSIT = parseFloat(process.env.MINIMUM_USD_DEPOSIT || '4');

router.post('/create-checkout-session',
    authenticateToken,
    body('amount').isFloat({ gt: MINIMUM_USD_DEPOSIT - 0.01 }).withMessage(`Minimum deposit is $${MINIMUM_USD_DEPOSIT.toFixed(2)}.`),
    handleValidationErrors,
    async (req, res) => {
        try {
            const { amount } = req.body;
            const user = req.user;
            const gemAmount = Math.floor(amount * USD_TO_GEMS_RATE);
            const amountInCents = Math.round(amount * 100);

            const session = await stripe.checkout.sessions.create({
                payment_method_types: ['card'],
                line_items: [{
                    price_data: {
                        currency: 'usd',
                        product_data: { name: `${gemAmount.toLocaleString()} Gems` },
                        unit_amount: amountInCents,
                    },
                    quantity: 1,
                }],
                mode: 'payment',
                metadata: {
                    userId: user.userId,
                    gemAmount: gemAmount,
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

router.post('/crypto-quote',
    authenticateToken,
    [
        body('amount').isFloat({ gt: MINIMUM_USD_DEPOSIT - 0.01 }).withMessage(`Minimum deposit is $${MINIMUM_USD_DEPOSIT.toFixed(2)}.`),
        body('tokenType').isIn(['USDC', 'USDT', 'POL']).withMessage('Invalid token type.')
    ],
    handleValidationErrors,
    async (req, res) => {
        const { amount, tokenType } = req.body;
        try {
            const packageUsdValue = parseFloat(amount);
            const gemAmount = Math.floor(packageUsdValue * USD_TO_GEMS_RATE);
            const priceSymbol = `${tokenType}_USD`;
            const currentPrice = await getLatestPrice(priceSymbol);

            if (!currentPrice || currentPrice <= 0) {
                throw new Error(`Could not fetch a valid price for ${tokenType}`);
            }

            const cryptoAmount = packageUsdValue / currentPrice;

            res.status(200).json({
                gemAmount: gemAmount,
                tokenType: tokenType,
                usdValue: packageUsdValue,
                cryptoAmount: cryptoAmount.toFixed(6),
                quoteExpiration: Date.now() + 15 * 60 * 1000
            });

        } catch (error) {
            console.error(`Crypto Quote Error for ${tokenType}:`, error);
            res.status(500).json({ message: `Failed to generate a deposit quote for ${tokenType}.` });
        }
    }
);

module.exports = router;
