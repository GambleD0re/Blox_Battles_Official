import React from 'react';
import { Menu, Settings, LogOut } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

const PlayerHeader = ({ user, onMenuClick }) => {
    const navigate = useNavigate();
    const { logout } = useAuth();

    if (!user) return null;

    return (
        <header className="widget flex items-center justify-between p-4 mb-8">
            <div className="flex items-center gap-4">
                <button onClick={onMenuClick} className="p-2 rounded-md hover:bg-gray-700/50 md:hidden">
                    <Menu className="text-gray-300"/>
                </button>
                {/* [MODIFIED] Updated the avatar border and added the new accent-glow class. */}
                <img 
                    src={user.roblox_avatar_url || 'https://placehold.co/64x64/161b22/7d8590?text=R'} 
                    alt="Player Avatar" 
                    className="w-16 h-16 rounded-full border-2 border-[var(--accent-color)] accent-glow"
                />
                <div>
                    <h1 className="text-2xl font-bold text-white">{user.linked_roblox_username || 'Welcome'}</h1>
                    <p className="text-gray-400">Ready for your next battle?</p>
                </div>
            </div>
            <div className="flex items-center gap-2">
                <div className="text-right hidden sm:block">
                    <div className="text-xl font-bold text-[var(--accent-color)]">{user.gems.toLocaleString()}</div>
                    <div className="text-xs text-gray-500">Gems</div>
                </div>
                <button onClick={() => navigate('/settings')} className="p-3 rounded-full hover:bg-gray-700/50 transition-colors">
                    <Settings className="text-gray-400"/>
                </button>
                <button onClick={logout} className="p-3 rounded-full hover:bg-gray-700/50 transition-colors">
                    <LogOut className="text-gray-400"/>
                </button>
            </div>
        </header>
    );
};

export default PlayerHeader;
