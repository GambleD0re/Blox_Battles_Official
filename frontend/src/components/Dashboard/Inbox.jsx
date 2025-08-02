import React from 'react';

// --- Sub-component for standard Duel notifications ---
const DuelNotification = ({ duel, onStartDuel, onViewDuel, onCancelDuel, onForfeitDuel }) => {
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
                    <button onClick={() => onStartDuel(duel)} className="btn btn-primary">Start</button>
                )}
                {duel.status === 'started' && (
                    <>
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

// --- [NEW] Sub-component for Discord Link Request notifications ---
const DiscordLinkNotification = ({ message, onRespondToLink }) => {
    const discordUsername = message.data.message;
    const messageId = message.id; // e.g., "message-123"

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

// --- Main Inbox Component (Dispatcher) ---
const Inbox = ({ notifications, onViewDuel, onCancelDuel, onStartDuel, onForfeitDuel, onCancelWithdrawal, onRespondToLink }) => {
    
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
                        // [FIX] Pass the props from Inbox down to the DuelNotification component.
                        onViewDuel={() => onViewDuel(notification)}
                        onCancelDuel={() => onCancelDuel(notification)}
                        onStartDuel={() => onStartDuel(notification.data)}
                        onForfeitDuel={() => onForfeitDuel(notification)}
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
