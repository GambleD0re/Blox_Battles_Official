// backend/routes/payouts.js
// This file handles all logic related to user withdrawals.

const express = require('express');
const { body } = require('express-validator');
const db = require('../database/database');
const { authenticateToken, handleValidationErrors } = require('../middleware/auth');
// [REMOVED] The stripe constant is no longer needed in this file for withdrawals.
const crypto = require('crypto');
const { sendCryptoPayout } = require('../services/cryptoPayoutService');

const router = express.Router();

const GEM_TO_USD_CONVERSION_RATE = 110;
const MINIMUM_GEM_WITHDRAWAL = 11;

// --- [REMOVED] STRIPE CONNECT ONBOARDING ---
// The entire '/create-account-link' route has been removed as it is no longer needed.

// --- [REMOVED] FIAT WITHDRAWAL REQUEST ---
// The entire '/request-fiat' route has been removed.


// --- CRYPTO WITHDRAWAL REQUEST (MANUAL REVIEW) ---
router.post('/request-crypto',
    authenticateToken,
    [
        body('gemAmount').isInt({ gt: 0 }).withMessage('A valid gem amount is required.'),
        body('recipientAddress').isEthereumAddress().withMessage('A valid recipient wallet address is required.'),
        body('tokenType').isIn(['USDC', 'USDT']).withMessage('A valid token type (USDC or USDT) is required.')
    ],
    handleValidationErrors,
    async (req, res) => {
        const { gemAmount, recipientAddress, tokenType } = req.body;
        const userId = req.user.userId;

        try {
            const user = await db.get('SELECT id, gems FROM users WHERE id = ?', [userId]);

            if (!user) {
                return res.status(404).json({ message: 'User not found.' });
            }
            if (user.gems < gemAmount) {
                return res.status(400).json({ message: 'Insufficient gem balance.' });
            }
            if (gemAmount < MINIMUM_GEM_WITHDRAWAL) {
                return res.status(400).json({ message: `Minimum withdrawal is ${MINIMUM_GEM_WITHDRAWAL} gems.` });
            }

            const amountUsd = gemAmount / GEM_TO_USD_CONVERSION_RATE;
            const payoutRequestId = crypto.randomUUID();

            await db.run('BEGIN TRANSACTION');

            await db.run('UPDATE users SET gems = gems - ? WHERE id = ?', [gemAmount, userId]);
            
            await db.run(
                `INSERT INTO payout_requests (id, user_id, type, provider, amount_gems, amount_usd, fee_usd, destination_address, status)
                 VALUES (?, ?, 'crypto', 'direct_node', ?, ?, ?, ?, 'awaiting_approval')`,
                [payoutRequestId, userId, gemAmount, amountUsd, 0, recipientAddress]
            );

            await db.run('COMMIT');

            res.status(200).json({ message: 'Withdrawal request submitted! It is now pending admin review.' });

        } catch (error) {
            await db.run('ROLLBACK').catch(console.error);
            console.error("Crypto Withdrawal Request Error:", error);
            res.status(500).json({ message: 'An internal server error occurred while processing your crypto withdrawal.' });
        }
    }
);

// --- CANCEL A PENDING WITHDRAWAL ---
router.post('/cancel-request/:id', authenticateToken, async (req, res) => {
    const requestId = req.params.id;
    const userId = req.user.userId;

    try {
        await db.run('BEGIN TRANSACTION');

        const request = await db.get(
            "SELECT * FROM payout_requests WHERE id = ? AND user_id = ? AND status = 'awaiting_approval'",
            [requestId, userId]
        );

        if (!request) {
            await db.run('ROLLBACK');
            return res.status(404).json({ message: 'Pending withdrawal request not found or cannot be canceled.' });
        }

        await db.run('UPDATE users SET gems = gems + ? WHERE id = ?', [request.amount_gems, userId]);
        
        await db.run("UPDATE payout_requests SET status = 'canceled_by_user' WHERE id = ?", [requestId]);

        await db.run('COMMIT');
        res.status(200).json({ message: 'Withdrawal request canceled and gems refunded.' });

    } catch (error) {
        await db.run('ROLLBACK').catch(console.error);
        console.error("Cancel Withdrawal Error:", error);
        res.status(500).json({ message: 'An internal server error occurred.' });
    }
});


// --- UPDATE AN APPROVED WITHDRAWAL ---
// [MODIFIED] Simplified this endpoint as it now only needs to handle crypto withdrawals.
router.put('/update-request/:id', authenticateToken,
    [
        body('recipientAddress').optional().isEthereumAddress().withMessage('A valid recipient wallet address is required.'),
        body('tokenType').optional().isIn(['USDC', 'USDT']).withMessage('A valid token type (USDC or USDT) is required.')
    ],
    handleValidationErrors,
    async (req, res) => {
        const requestId = req.params.id;
        const userId = req.user.userId;
        const { recipientAddress, tokenType } = req.body;

        try {
            const request = await db.get(
                "SELECT * FROM payout_requests WHERE id = ? AND user_id = ? AND status = 'approved'",
                [requestId, userId]
            );

            if (!request) {
                return res.status(404).json({ message: 'Approved withdrawal request not found or it cannot be modified at this time.' });
            }

            if (!recipientAddress && !tokenType) {
                return res.status(400).json({ message: 'No new details provided for update.' });
            }
            
            const newAddress = recipientAddress || request.destination_address;
            const newTokenType = tokenType || request.tokenType; // Assuming tokenType is stored on the request
            
            await db.run(
                "UPDATE payout_requests SET destination_address = ?, tokenType = ? WHERE id = ?",
                [newAddress, newTokenType, requestId]
            );

            res.status(200).json({ message: 'Withdrawal details updated successfully.' });

        } catch (error) {
            console.error("Update Withdrawal Details Error:", error);
            res.status(500).json({ message: 'An internal server error occurred.' });
        }
    }
);


module.exports = router;