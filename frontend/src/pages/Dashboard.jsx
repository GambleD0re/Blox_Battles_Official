import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import * as api from '../services/api';

// Import all the necessary user-facing components and modals
import PlayerHeader from '../components/Dashboard/PlayerHeader';
import ChallengePlayer from '../components/Dashboard/ChallengePlayer';
import Inbox from '../components/Dashboard/Inbox';
import DuelHistory from '../components/Dashboard/DuelHistory';
import { ChallengeModal, DuelDetailsModal, ConfirmationModal, TranscriptModal, PostDuelModal } from '../components/Dashboard/Modals';

const Dashboard = () => {
    const { user, token, refreshUser } = useAuth();

    // State for data
    const [inboxNotifications, setInboxNotifications] = useState([]);
    const [duelHistory, setDuelHistory] = useState([]);
    const [gameData, setGameData] = useState({ maps: [], weapons: [], regions: [] });
    const [unseenResults, setUnseenResults] = useState([]);

    // State for UI and Modals
    const [isLoading, setIsLoading] = useState(true);
    const [message, setMessage] = useState({ text: '', type: '' });
    const [isChallengeModalOpen, setChallengeModalOpen] = useState(false);
    const [isDetailsModalOpen, setDetailsModalOpen] = useState(false);
    const [isActiveDetailsModalOpen, setActiveDetailsModalOpen] = useState(false);
    const [isForfeitModalOpen, setForfeitModalOpen] = useState(false);
    const [isCancelModalOpen, setCancelModalOpen] = useState(false);
    const [isTranscriptModalOpen, setTranscriptModalOpen] = useState(false);
    
    // State to hold data for modals
    const [selectedOpponent, setSelectedOpponent] = useState(null);
    const [selectedDuel, setSelectedDuel] = useState(null);
    const [selectedTranscript, setSelectedTranscript] = useState(null);

    // Helper function to show temporary messages
    const showMessage = (text, type = 'success') => {
        setMessage({ text, type });
        setTimeout(() => setMessage({ text: '', type: '' }), 5000);
    };

    // Main data fetching function
    const fetchDashboardData = useCallback(async () => {
        setIsLoading(true);
        try {
            const [inboxData, historyData, gameData, unseenResultsData] = await Promise.all([
                api.getInbox(token),
                api.getDuelHistory(token),
                api.getGameData(token),
                api.getUnseenResults(token)
            ]);
            setInboxNotifications(inboxData);
            setDuelHistory(historyData);
            setGameData(gameData);
            setUnseenResults(unseenResultsData);
        } catch (error) {
            showMessage(error.message, 'error');
        } finally {
            setIsLoading(false);
        }
    }, [token]);

    useEffect(() => {
        fetchDashboardData();
    }, [fetchDashboardData]);

    // --- Modal Open/Close Handlers ---
    const handleChallengePlayer = (opponent) => {
        setSelectedOpponent(opponent);
        setChallengeModalOpen(true);
    };
    
    const handleViewDuel = (duel) => {
        setSelectedDuel(duel);
        setDetailsModalOpen(true);
    };

    const handleViewActiveDuel = (duel) => {
        setSelectedDuel({ data: duel }); // Standardize structure for details modal
        setActiveDetailsModalOpen(true);
    };
    
    const handleOpenForfeitModal = (duel) => {
        setSelectedDuel(duel);
        setForfeitModalOpen(true);
    };

    const handleOpenCancelModal = (duel) => {
        setSelectedDuel(duel);
        setCancelModalOpen(true);
    };

    const handleViewTranscript = async (duelId) => {
        try {
            const transcriptData = await api.getTranscript(duelId, token);
            setSelectedTranscript(transcriptData);
            setTranscriptModalOpen(true);
        } catch (error) {
            showMessage(error.message, 'error');
        }
    };

    // --- API Action Handlers ---
    const handleChallengeSubmit = async (challengeData) => {
        try {
            const result = await api.sendChallenge(challengeData, token);
            showMessage(result.message, 'success');
            setChallengeModalOpen(false);
            fetchDashboardData(); // Refresh inbox
        } catch (error) {
            showMessage(error.message, 'error');
        }
    };
    
    const handleRespondToDuel = async (duelId, response) => {
        try {
            const result = await api.respondToDuel({ duel_id: duelId, response }, token);
            showMessage(result.message, 'success');
            setDetailsModalOpen(false);
            refreshUser(); // Refresh user gems
            fetchDashboardData();
        } catch (error) {
            showMessage(error.message, 'error');
        }
    };

    const handleStartDuel = async (duel) => {
        try {
            const result = await api.startDuel(duel.id, token);
            showMessage(result.message, 'success');
            fetchDashboardData();
        } catch(error) {
            showMessage(error.message, 'error');
        }
    };
    
    const handleConfirmForfeit = async () => {
        try {
            const result = await api.forfeitDuel(selectedDuel.data.id, token);
            showMessage(result.message, 'success');
            setForfeitModalOpen(false);
            refreshUser();
            fetchDashboardData();
        } catch (error) {
            showMessage(error.message, 'error');
        }
    };
    
    const handleConfirmCancel = async () => {
        try {
            const result = await api.cancelDuel(selectedDuel.data.id, token);
            showMessage(result.message, 'success');
            setCancelModalOpen(false);
            fetchDashboardData();
        } catch (error) {
            showMessage(error.message, 'error');
        }
    };

    const handleConfirmResult = async (duelId) => {
        try {
            await api.confirmDuelResult(duelId, token);
            setUnseenResults(prev => prev.filter(r => r.id !== duelId));
            showMessage('Result confirmed!', 'success');
            refreshUser(); // This will also refresh history eventually on next load
        } catch (error) {
            showMessage(error.message, 'error');
        }
    };
    
    const handleDisputeResult = async (duelId, disputeData) => {
        try {
            const result = await api.fileDispute(duelId, disputeData, token);
            showMessage(result.message, 'success');
            setUnseenResults(prev => prev.filter(r => r.id !== duelId));
            fetchDashboardData();
        } catch (error) {
            showMessage(error.message, 'error');
        }
    };

    // --- Render Logic ---
    if (isLoading) {
        return <div className="flex items-center justify-center min-h-screen">Loading Dashboard...</div>;
    }

    return (
        <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
            {message.text && (
                <div className={`fixed top-5 right-5 p-4 rounded-lg text-white font-bold shadow-lg z-50 ${message.type === 'success' ? 'bg-green-500' : 'bg-red-500'}`}>
                    {message.text}
                </div>
            )}
            
            <PlayerHeader user={user} />

            <main className="dashboard-grid mt-8">
                <div className="space-y-6">
                    <Inbox 
                        notifications={inboxNotifications}
                        onViewDuel={handleViewDuel}
                        onCancelDuel={handleOpenCancelModal}
                        onStartDuel={handleStartDuel}
                        onForfeitDuel={handleOpenForfeitModal}
                        onViewActiveDuelDetails={handleViewActiveDuel}
                    />
                </div>
                <div className="space-y-6">
                    <ChallengePlayer token={token} onChallenge={handleChallengePlayer} />
                    <DuelHistory history={duelHistory} onViewTranscript={handleViewTranscript} />
                </div>
            </main>

            {/* --- Modals --- */}
            <ChallengeModal 
                isOpen={isChallengeModalOpen} 
                onClose={() => setChallengeModalOpen(false)}
                opponent={selectedOpponent}
                currentUser={user}
                gameData={gameData}
                onChallengeSubmit={handleChallengeSubmit}
                onError={(msg) => showMessage(msg, 'error')}
            />
            <DuelDetailsModal 
                isOpen={isDetailsModalOpen} 
                onClose={() => setDetailsModalOpen(false)}
                duel={selectedDuel}
                onRespond={handleRespondToDuel}
            />
            <DuelDetailsModal
                isOpen={isActiveDetailsModalOpen}
                onClose={() => setActiveDetailsModalOpen(false)}
                duel={selectedDuel}
                isViewingOnly={true}
            />
            <ConfirmationModal
                isOpen={isForfeitModalOpen}
                onClose={() => setForfeitModalOpen(false)}
                onConfirm={handleConfirmForfeit}
                title="Forfeit Duel?"
                text="Are you sure you want to forfeit? This action cannot be undone and your wager will be lost."
                confirmText="Yes, Forfeit"
            />
            <ConfirmationModal
                isOpen={isCancelModalOpen}
                onClose={() => setCancelModalOpen(false)}
                onConfirm={handleConfirmCancel}
                title="Cancel Challenge?"
                text="Are you sure you want to cancel this pending challenge?"
                confirmText="Yes, Cancel"
            />
             <TranscriptModal 
                isOpen={isTranscriptModalOpen} 
                onClose={() => setTranscriptModalOpen(false)} 
                transcript={selectedTranscript} 
            />
            {(unseenResults || []).map(result => (
                <PostDuelModal 
                    key={result.id}
                    isOpen={true}
                    result={result}
                    currentUser={user}
                    onConfirm={handleConfirmResult}
                    onDispute={handleDisputeResult}
                />
            ))}
        </div>
    );
};

export default Dashboard;```

### Modified File: `frontend/src/components/Dashboard/Inbox.jsx`

Similarly, I've added a check to the `Inbox` component to prevent it from crashing if the `notifications` prop is `null`.

```jsx
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import * as api from '../../services/api';

// --- Sub-component for standard Duel notifications ---
const DuelNotification = ({ duel, onStartDuel, onViewDuel, onCancelDuel, onForfeitDuel, onViewActiveDuelDetails }) => {
    return (
        <div className="duel-item">
            <div className="flex-grow">
                <p className="font-semibold">{duel.type === 'incoming' ? `From: ${duel.challenger_username}` : `To: ${duel.opponent_username}`}</p>
                <p className="text-sm text-gray-400">Wager: {duel.wager} Gems | Map: {duel.map_name}</p>
                {duel.status === 'accepted' && <p className="text-sm text-yellow-400">Status: Accepted - Ready to Start</p>}
                {duel.status === 'started' && <p className="text-sm text-green-400">Status: Started - Join Now!</p>}
            </div>
            
            <div className="flex items-center gap-2">
                {duel.status === 'accepted' && (
                    <>
                        <button onClick={() => onViewActiveDuelDetails(duel)} className="btn btn-secondary !py-2 !px-3">Details</button>
                        <button onClick={() => onStartDuel(duel)} className="btn btn-primary">Start</button>
                    </>
                )}
                {duel.status === 'started' && (
                    <>
                        <button onClick={() => onViewActiveDuelDetails(duel)} className="btn btn-secondary !py-2 !px-3">Details</button>
                        <a href={duel.server_invite_link || '#'} target="_blank" rel="noopener noreferrer" className="btn btn-primary" onClick={(e) => { if (!duel.server_invite_link) e.preventDefault(); }}>
                            Join Server
                        </a>
                        <button onClick={() => onForfeitDuel(duel)} className="btn btn-danger">
                            Forfeit
                        </button>
                    </>
                )}
                {duel.status === 'pending' && duel.type === 'incoming' && (
                    <button onClick={() => onViewDuel(duel)} className="btn btn-secondary">View</button>
                )}
                {duel.status === 'pending' && duel.type === 'outgoing' && (
                    <button onClick={() => onCancelDuel(duel)} className="btn btn-secondary">Cancel</button>
                )}
            </div>
        </div>
    );
};

// --- Sub-component for "Under Review" notifications ---
const DuelUnderReviewNotification = ({ duel }) => {
    const opponent_username = duel.challenger_id.toString() === duel.userId ? duel.opponent_username : duel.challenger_username;
    return (
        <div className="duel-item bg-gray-800/50 border-l-4 border-yellow-500">
            <div className="flex-grow flex items-center gap-3">
                <span className="text-yellow-400 text-xl">⚖️</span>
                <div>
                    <p className="font-semibold text-yellow-400">Duel Under Review</p>
                    <p className="text-sm text-gray-400">Your duel with {opponent_username} is being reviewed by an admin.</p>
                </div>
            </div>
        </div>
    );
};

// --- Sub-component for Withdrawal Request notifications ---
const WithdrawalNotification = ({ request, onCancelWithdrawal }) => {
    const isPending = request.status === 'awaiting_approval';
    const isApproved = request.status === 'approved';

    return (
        <div className={`duel-item ${isApproved ? 'bg-green-900/30 border-l-4 border-green-500' : 'bg-gray-800/50 border-l-4 border-gray-600'}`}>
            <div className="flex-grow flex items-center gap-3">
                <span className="text-2xl">{isApproved ? '✅' : '⏳'}</span>
                <div>
                    <p className={`font-semibold ${isApproved ? 'text-green-400' : 'text-gray-300'}`}>
                        Withdrawal {isApproved ? 'Approved' : 'Pending Review'}
                    </p>
                    <p className="text-sm text-gray-400">{request.amount_gems} Gems for ${((request.amount_gems || 0) / 110).toFixed(2)}</p>
                </div>
            </div>
            <div className="flex items-center gap-2">
                {isPending && (
                    <button onClick={() => onCancelWithdrawal(request)} className="btn btn-secondary">Cancel</button>
                )}
            </div>
        </div>
    );
};

// --- Sub-component for Admin Messages ---
const AdminMessageNotification = ({ message }) => {
    return (
        <div className="duel-item bg-red-900/30 border-l-4 border-red-500">
             <div className="flex-grow flex items-center gap-3">
                <span className="text-red-400 text-xl">❗</span>
                <div>
                    <p className="font-semibold text-red-400">{message.title}</p>
                    <p className="text-sm text-gray-300">{message.message}</p>
                </div>
            </div>
        </div>
    );
};

// --- Sub-component for Discord Link Request notifications ---
const DiscordLinkNotification = ({ message, onRespondToLink }) => {
    const discordUsername = message.data.message;
    const messageId = message.id;

    return (
        <div className="duel-item bg-blue-900/30 border-l-4 border-blue-500">
            <div className="flex-grow flex items-center gap-3">
                <span className="text-blue-400 text-2xl">🔗</span>
                <div>
                    <p className="font-semibold text-blue-400">Discord Link Request</p>
                    <p className="text-sm text-gray-300">User <span className="font-bold">{discordUsername}</span> wants to link their Discord account.</p>
                </div>
            </div>
            <div className="flex items-center gap-2">
                <button onClick={() => onRespondToLink(messageId, 'decline')} className="btn btn-danger !py-1 !px-3 !text-sm">Decline</button>
                <button onClick={() => onRespondToLink(messageId, 'confirm')} className="btn btn-accept !py-1 !px-3 !text-sm">Confirm</button>
            </div>
        </div>
    );
};

// --- Sub-component for Server Crash Refund messages ---
const ServerCrashNotification = ({ message }) => {
    return (
        <div className="duel-item bg-yellow-900/30 border-l-4 border-yellow-500">
             <div className="flex-grow flex items-center gap-3">
                <span className="text-yellow-400 text-xl">⚠️</span>
                <div>
                    <p className="font-semibold text-yellow-400">{message.title}</p>
                    <p className="text-sm text-gray-300">{message.message}</p>
                </div>
            </div>
        </div>
    );
};

// --- Sub-component for Dispute Discord Link Prompt ---
const DisputeLinkPromptNotification = ({ message, token, showMessage, refreshData }) => {
    const { user } = useAuth();
    const navigate = useNavigate();

    const handleContinue = async () => {
        try {
            const disputeId = message.reference_id;
            const result = await api.continueDisputeToDiscord(disputeId, token);
            showMessage(result.message, 'success');
            refreshData(); // Refresh inbox to remove the prompt
        } catch (error) {
            showMessage(error.message, 'error');
        }
    };

    return (
        <div className="duel-item bg-orange-900/30 border-l-4 border-orange-500">
            <div className="flex-grow">
                <p className="font-semibold text-orange-400">{message.title}</p>
                <p className="text-sm text-gray-300">{message.message}</p>
            </div>
            <div className="flex items-center">
                {user.discord_id ? (
                    <button onClick={handleContinue} className="btn btn-primary !py-2 !px-3">Continue</button>
                ) : (
                    <button onClick={() => navigate('/settings')} className="btn btn-secondary !py-2 !px-3">Link Discord</button>
                )}
            </div>
        </div>
    );
};

// --- Main Inbox Component (Dispatcher) ---
const Inbox = ({ notifications, onViewDuel, onCancelDuel, onStartDuel, onForfeitDuel, onCancelWithdrawal, onRespondToLink, onViewActiveDuelDetails, token, showMessage, refreshData }) => {
    
    const renderNotification = (notification) => {
        switch (notification.type) {
            case 'duel':
                if (notification.data.status === 'under_review') {
                    return <DuelUnderReviewNotification key={notification.id} duel={notification.data} />;
                }
                return (
                    <DuelNotification 
                        key={notification.id}
                        duel={notification.data}
                        onViewDuel={() => onViewDuel(notification)}
                        onCancelDuel={() => onCancelDuel(notification)}
                        onStartDuel={() => onStartDuel(notification.data)}
                        onForfeitDuel={() => onForfeitDuel(notification)}
                        onViewActiveDuelDetails={() => onViewActiveDuelDetails(notification.data)}
                    />
                );
            case 'withdrawal_request':
                return (
                    <WithdrawalNotification 
                        key={notification.id}
                        request={notification.data}
                        onCancelWithdrawal={() => onCancelWithdrawal(notification.data)}
                    />
                );
            case 'admin_message':
                 return (
                    <AdminMessageNotification
                        key={notification.id}
                        message={notification.data}
                    />
                );
            case 'discord_link_request':
                return (
                    <DiscordLinkNotification
                        key={notification.id}
                        message={notification}
                        onRespondToLink={onRespondToLink}
                    />
                );
            case 'server_crash_refund':
                return (
                    <ServerCrashNotification
                        key={notification.id}
                        message={notification.data}
                    />
                );
            case 'dispute_discord_link_prompt':
                return (
                    <DisputeLinkPromptNotification
                        key={notification.id}
                        message={notification.data}
                        token={token}
                        showMessage={showMessage}
                        refreshData={refreshData}
                    />
                );
            default:
                console.warn("Unknown notification type:", notification.type);
                return null;
        }
    };

    return (
        <div className="widget">
            <h2 className="widget-title">Inbox</h2>
            <div className="space-y-3">
                {notifications && notifications.length > 0 ? (
                    notifications.map(renderNotification)
                ) : (
                    <p className="text-gray-500 text-center py-4">Your inbox is empty.</p>
                )}
            </div>
        </div>
    );
};

export default Inbox;
