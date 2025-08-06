import React from 'react';

const DuelHistory = ({ history, onViewTranscript }) => {
    return (
        <div className="widget">
            <h3 className="widget-title">Duel History</h3>
            <div className="space-y-1">
                {history.length > 0 ? history.map(duel => (
                    <div key={duel.id} className="duel-item">
                        <div className={`history-outcome-gems ${
                            duel.outcome === 'win' ? 'text-[var(--win-color)]' : 
                            duel.outcome === 'loss' || duel.outcome === 'forfeit' ? 'text-[var(--loss-color)]' : 
                            'text-[var(--text-muted)]'
                        }`}>
                            {duel.outcome === 'win' ? `+${duel.wager}` : `-${duel.wager}`}
                        </div>
                        <div className="flex-grow">
                            <p className="font-semibold">vs {duel.opponent_name}</p>
                            <p className="text-sm text-gray-400">Wager: {duel.wager} Gems</p>
                        </div>
                        <button onClick={() => onViewTranscript(duel.id)} className="btn-view-transcript">Transcript</button>
                    </div>
                )) : <p className="text-gray-500 text-center py-4">No completed duels yet.</p>}
            </div>
        </div>
    );
};

export default DuelHistory;
