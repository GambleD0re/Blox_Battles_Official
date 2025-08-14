--- START OF FILE PlayerHeader.jsx ---
import React from 'react';
import { useNavigate } from 'react-router-dom';

const SettingsIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82-.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06-.06a1.65 1.65 0 0 0-.33 1.82V15a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>;
const AdminIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>;
const MenuIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>;

const PlayerHeader = ({ user, onMenuClick }) => {
    const navigate = useNavigate();
    return (
        <header className="dashboard-header !p-4">
            <div className="player-info !gap-4">
                <button 
                    onClick={onMenuClick} 
                    className="flex items-center justify-center w-12 h-12 rounded-lg bg-gray-900/50 border border-gray-700 text-gray-400 hover:text-white hover:border-blue-500 transition-colors duration-200" 
                    title="Open Menu"
                >
                    <MenuIcon />
                </button>
                <img src={user.roblox_avatar_url || 'https://placehold.co/60x60/161b22/7d8590?text=R'} alt="Avatar" className="player-avatar !w-16 !h-16" />
                <div>
                    <h1 className="player-name !text-2xl">{user.linked_roblox_username || user.email}</h1>
                    <p className="player-id !text-xs">BloxBattles ID: {user.id}</p>
                </div>
            </div>
            <div className="player-stats">
                <button 
                    onClick={() => navigate('/deposit')} 
                    className="stat-item gems transition-transform transform hover:scale-105" 
                    title="Go to Deposit Page"
                >
                    <span className="stat-value !text-2xl">{user.gems.toLocaleString()}</span>
                    <span className="stat-label">Gems</span>
                </button>
                <div className="stat-item wins">
                    <span className="stat-value !text-2xl">{user.wins}</span>
                    <span className="stat-label">Wins</span>
                </div>
                <div className="stat-item losses">
                    <span className="stat-value !text-2xl">{user.losses}</span>
                    <span className="stat-label">Losses</span>
                </div>
                <button onClick={() => navigate('/settings')} className="btn-settings" title="Settings"><SettingsIcon /></button>
                {user.is_admin && <button onClick={() => navigate('/admin')} className="btn-settings" title="Admin"><AdminIcon /></button>}
            </div>
        </header>
    );
};

export default PlayerHeader;
