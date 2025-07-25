import React from 'react';

const Leaderboard = ({ leaderboard }) => {
    return (
        <div className="widget">
            <h3 className="widget-title">Leaderboard</h3>
            <div className="space-y-1">
                {leaderboard.length > 0 ? leaderboard.map((player, index) => (
                    <div key={player.linked_roblox_id || index} className="leaderboard-item">
                        <span className="leaderboard-rank">#{index + 1}</span>
                        <img 
                            src={player.avatar_url || 'https://placehold.co/40x40/161b22/7d8590?text=R'} 
                            alt={player.linked_roblox_username} 
                            className="leaderboard-avatar" 
                        />
                        <div className="leaderboard-info">
                            <p className="name">{player.linked_roblox_username}</p>
                            <p className="stats">
                                <span className="win">{player.wins}W</span> / <span className="loss">{player.losses}L</span>
                            </p>
                        </div>
                        <div className="stat-item gems !bg-transparent !p-0 !min-w-0 !border-none">
                            <span className="stat-value !text-base">{player.gems}</span>
                        </div>
                    </div>
                )) : <p className="text-gray-500 text-center py-4">Leaderboard is empty.</p>}
            </div>
        </div>
    );
};

export default Leaderboard;
