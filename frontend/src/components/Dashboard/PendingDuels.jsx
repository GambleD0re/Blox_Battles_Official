import React from 'react';

const PendingDuels = ({ duels, onJoin }) => {
    return (
        <div className="space-y-4">
            {duels.length > 0 ? duels.map(duel => (
                <div key={duel.id} className="bg-[var(--bg-color)] p-4 rounded-md border border-[var(--border-color)] flex items-center justify-between">
                    <div>
                        <p className="text-white">From: <span className="font-semibold">{duel.challenger_username}</span></p>
                        <p className="text-sm text-[var(--text-muted)]">Map: {duel.map_name} | Status: <span className="font-semibold">{duel.status}</span></p>
                    </div>
                    {/* The "Join Server" button should only show for accepted duels where the bot has provided a link */}
                    {duel.status === 'accepted' && (
                         <button onClick={() => onJoin(duel)} className="btn btn-primary">
                            Join Server
                        </button>
                    )}
                </div>
            )) : <p className="text-[var(--text-muted)] text-center py-4">No active duels.</p>}
        </div>
    );
};

export default PendingDuels;
