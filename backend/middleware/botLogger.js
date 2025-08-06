// backend/middleware/botLogger.js

const logHistory = [];
const MAX_LOGS = 100; // Store a maximum of 100 log entries in memory

const botLogger = (req, res, next) => {
    const start = Date.now();
    
    res.on('finish', () => {
        const duration = Date.now() - start;
        const logEntry = {
            timestamp: new Date().toISOString(),
            method: req.method,
            url: req.originalUrl,
            status: res.statusCode,
            duration: `${duration}ms`,
            ip: req.ip,
        };

        // **THE FIX IS HERE:** Add new logs to the end of the array.
        logHistory.push(logEntry);

        // Trim the array from the beginning if it exceeds the maximum size
        if (logHistory.length > MAX_LOGS) {
            logHistory.shift();
        }
    });

    next();
};

const getLogs = () => {
    return logHistory;
};

module.exports = { botLogger, getLogs };
