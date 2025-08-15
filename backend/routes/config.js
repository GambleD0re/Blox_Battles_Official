const express = require('express');
const router = express.Router();

router.get('/', (req, res) => {
    try {
        const queueWagers = process.env.QUEUE_WAGERS 
            ? process.env.QUEUE_WAGERS.split(',').map(Number) 
            : [50, 100, 200, 500, 1000];

        const config = {
            usdToGemsRate: parseInt(process.env.USD_TO_GEMS_RATE || '100', 10),
            gemToUsdConversionRate: parseInt(process.env.GEM_TO_USD_CONVERSION_RATE || '110', 10),
            minimumUsdDeposit: parseFloat(process.env.MINIMUM_USD_DEPOSIT || '4'),
            minimumGemWithdrawal: parseInt(process.env.MINIMUM_GEM_WITHDRAWAL || '11', 10),
            queueWagers: queueWagers,
            discordInviteUrl: process.env.DISCORD_INVITE_URL || ''
        };

        res.status(200).json(config);
    } catch (error) {
        console.error("Failed to construct and serve app config:", error);
        res.status(500).json({ message: "Could not retrieve server configuration." });
    }
});

module.exports = router;
