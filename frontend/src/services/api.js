// src/services/api.js
// This file centralizes all API calls to the backend.

const API_BASE_URL = '/api';

// A helper function to handle fetch requests, including authentication.
const apiRequest = async (endpoint, method = 'GET', body = null, token = null) => {
    const options = {
        method,
        headers: {},
    };

    if (token) {
        options.headers['Authorization'] = `Bearer ${token}`;
    }

    if (body) {
        options.headers['Content-Type'] = 'application/json';
        options.body = JSON.stringify(body);
    }

    try {
        const response = await fetch(`${API_BASE_URL}${endpoint}`, options);
        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message || `Error: ${response.status}`);
        }

        return data;
    } catch (error) {
        console.error(`API request failed: ${method} ${endpoint}`, error);
        throw error;
    }
};

// --- AUTHENTICATION ---
export const loginUser = (credentials) => apiRequest('/auth/login', 'POST', credentials);
export const registerUser = (userData) => apiRequest('/auth/register', 'POST', userData);

// --- USER & DASHBOARD ---
export const getDashboardData = (token) => apiRequest('/user-data', 'GET', null, token);
export const verifyRobloxAccount = (robloxUsername, token) => apiRequest('/roblox/verify', 'POST', { robloxUsername }, token);
export const getInbox = (token) => apiRequest('/inbox', 'GET', null, token);
export const getTransactionHistory = (token) => apiRequest('/history', 'GET', null, token);


// --- DUELS & DISPUTES ---
export const getDuelHistory = (token) => apiRequest('/duels/history', 'GET', null, token);
export const getDetailedDuelHistory = (token) => apiRequest('/duel-history', 'GET', null, token);
export const findPlayer = (robloxUsername, token) => apiRequest(`/duels/find-player?roblox_username=${encodeURIComponent(robloxUsername)}`, 'GET', null, token);
export const sendChallenge = (challengeData, token) => apiRequest('/duels/challenge', 'POST', challengeData, token);
export const respondToDuel = (responseData, token) => apiRequest('/duels/respond', 'POST', responseData, token);
export const cancelDuel = (duelId, token) => apiRequest(`/duels/cancel/${duelId}`, 'DELETE', null, token);
export const getTranscript = (duelId, token) => apiRequest(`/duels/transcript/${duelId}`, 'GET', null, token);
export const startDuel = (duelId, token) => apiRequest(`/duels/${duelId}/start`, 'POST', null, token);
export const forfeitDuel = (duelId, token) => apiRequest(`/duels/${duelId}/forfeit`, 'POST', null, token);
export const getUnseenResults = (token) => apiRequest('/duels/unseen-results', 'GET', null, token);
export const confirmDuelResult = (duelId, token) => apiRequest(`/duels/${duelId}/confirm-result`, 'POST', null, token);
export const fileDispute = (duelId, disputeData, token) => apiRequest(`/duels/${duelId}/dispute`, 'POST', disputeData, token);


// --- STATIC DATA ---
export const getGameData = (token) => apiRequest('/gamedata', 'GET', null, token);

// --- SYSTEM STATUS ---
export const getBotStatus = (token) => apiRequest('/status', 'GET', null, token);

// --- PAYMENTS & PAYOUTS ---
export const createCheckoutSession = (amount, token) => apiRequest('/payments/create-checkout-session', 'POST', { amount }, token);
export const getCryptoDepositAddress = (token) => apiRequest('/payments/crypto-address', 'GET', null, token);
export const getCryptoQuote = (amount, tokenType, token) => apiRequest('/payments/crypto-quote', 'POST', { amount, tokenType }, token);
export const requestCryptoWithdrawal = (gemAmount, recipientAddress, tokenType, token) => apiRequest('/payouts/request-crypto', 'POST', { gemAmount, recipientAddress, tokenType }, token);
export const cancelWithdrawalRequest = (requestId, token) => apiRequest(`/payouts/cancel-request/${requestId}`, 'POST', null, token);
export const updateWithdrawalDetails = (requestId, details, token) => apiRequest(`/payouts/update-request/${requestId}`, 'PUT', details, token);


// --- SETTINGS ---
export const updatePassword = (passwordData, token) => apiRequest('/user/password', 'PUT', passwordData, token);
export const unlinkRoblox = (token) => apiRequest('/user/unlink/roblox', 'POST', null, token);
export const deleteAccount = (password, token) => apiRequest('/user/delete/account', 'DELETE', { password }, token);
export const updateNotificationPreference = (enabled, token) => apiRequest('/user/notification-preference', 'PUT', { enabled }, token);

// --- TOURNAMENTS ---
export const getTournaments = (token) => apiRequest('/tournaments', 'GET', null, token);
export const getTournamentDetails = (id, token) => apiRequest(`/tournaments/${id}`, 'GET', null, token);
export const registerForTournament = (id, token) => apiRequest(`/tournaments/${id}/register`, 'POST', null, token);

// --- [NEW] DISCORD LINKING ---
export const respondToDiscordLink = (messageId, response, token) => apiRequest('/discord/respond-link', 'POST', { messageId, response }, token);

// --- ADMIN ---
export const getAdminStats = (token) => apiRequest('/admin/stats', 'GET', null, token);
export const getAdminLogs = (token) => apiRequest('/admin/logs', 'GET', null, token);
export const getAdminUsers = (searchQuery, token, status) => {
    const params = new URLSearchParams();
    if (searchQuery) { params.append('search', searchQuery); }
    if (status) { params.append('status', status); }
    return apiRequest(`/admin/users?${params.toString()}`, 'GET', null, token);
};
export const updateUserGems = (userId, amount, token) => apiRequest(`/admin/users/${userId}/gems`, 'POST', { amount }, token);
export const banUser = (userId, reason, duration_hours, token) => apiRequest(`/admin/users/${userId}/ban`, 'POST', { reason, duration_hours }, token);
export const unbanUser = (userId, token) => apiRequest(`/admin/users/${userId}/ban`, 'DELETE', null, token);
export const deleteUserAccount = (userId, token) => apiRequest(`/admin/users/${userId}`, 'DELETE', null, token);
export const getAdminServers = (token) => apiRequest('/admin/servers', 'GET', null, token);
export const getPendingDisputes = (token) => apiRequest('/admin/disputes', 'GET', null, token);
export const resolveDispute = (disputeId, resolutionType, token) => apiRequest(`/admin/disputes/${disputeId}/resolve`, 'POST', { resolutionType }, token);
export const getAdminPayoutRequests = (token) => apiRequest('/admin/payout-requests', 'GET', null, token);
export const getAdminUserDetailsForPayout = (userId, payoutId, token) => apiRequest(`/admin/users/${userId}/details-for-payout/${payoutId}`, 'GET', null, token);
export const approvePayoutRequest = (requestId, token) => apiRequest(`/admin/payout-requests/${requestId}/approve`, 'POST', null, token);
export const declinePayoutRequest = (requestId, reason, token) => apiRequest(`/admin/payout-requests/${requestId}/decline`, 'POST', { reason }, token);
// [CORRECTED] Admin Tournament Functions now included.
export const createTournament = (tournamentData, token) => apiRequest('/admin/tournaments', 'POST', tournamentData, token);
export const getAdminTournaments = (token) => apiRequest('/admin/tournaments', 'GET', null, token);
export const cancelTournament = (id, token) => apiRequest(`/admin/tournaments/${id}`, 'DELETE', null, token);
