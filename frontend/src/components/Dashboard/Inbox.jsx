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
                {notifications.length > 0 ? (
                    notifications.map(renderNotification)
                ) : (
                    <p className="text-gray-500 text-center py-4">Your inbox is empty.</p>
                )}
            </div>
        </div>
    );
};

export default Inbox;
