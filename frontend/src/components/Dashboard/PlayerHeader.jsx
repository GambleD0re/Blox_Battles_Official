import React from 'react';
import { Settings } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const PlayerHeader = ({ user, onMenuClick }) => {
    const navigate = useNavigate();

    return (
        <header className="dashboard-header">
            <div className="player-info">
                <img 
                    src={user.roblox_avatar_url || 'https://placehold.co/80x80/101418/7d8590?text=R'} 
                    alt="Player Avatar" 
                    className="player-avatar" 
                />
                <div>
                    <h1 className="player-name">{user.linked_roblox_username}</h1>
                    <p className="player-id">@{user.email}</p>
                </div>
            </div>

            <div className="player-stats">
                <div className="stat-item gems">
                    <span className="stat-value">{user.gems.toLocaleString()}</span>
                    <span className="stat-label">Gems</span>
                </div>
                <div className="stat-item wins">
                    <span className="stat-value">{user.wins}</span>
                    <span className="stat-label">Wins</span>
                </div>
                <div className="stat-item losses">
                    <span className="stat-value">{user.losses}</span>
                    <span className="stat-label">Losses</span>
                </div>
                <button onClick={() => navigate('/settings')} className="btn-settings" aria-label="Settings">
                    <Settings size={20} />
                </button>
                 <button onClick={onMenuClick} className="btn-settings md:hidden" aria-label="Open Menu">
                    {/* A simple hamburger menu icon */}
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
                </button>
            </div>
        </header>
    );
};

export default PlayerHeader;
