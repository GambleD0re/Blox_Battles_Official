// START OF FILE frontend/pages/BanNotice.jsx ---
import React from 'react';
import { useAuth } from '../context/AuthContext';

const BanNotice = () => {
    const { user, logout, appConfig } = useAuth();

    const isPermanent = !user.ban_expires_at;
    const banExpiresDate = user.ban_expires_at ? new Date(user.ban_expires_at) : null;
    const now = new Date();

    const daysRemaining = (d1, d2) => {
        if (!d1 || !d2) return 0;
        const diffTime = d1.getTime() - d2.getTime();
        return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    };

    return (
        <div className="flex items-center justify-center min-h-screen bg-gray-900 text-white">
            <div className="w-full max-w-2xl p-8 space-y-6 bg-gray-800/50 rounded-xl shadow-lg border-2 border-red-700 text-center">
                
                <h1 className="text-4xl font-black text-red-500">
                    Your account has been {isPermanent ? "Permanently" : "Temporarily"} Banned
                </h1>

                {isPermanent ? (
                    <p className="text-lg text-yellow-300">
                        <b>If you fail to begin the appeals process within 30 days an admin may manually terminate your account (voids all gems)</b>
                    </p>
                ) : (
                    <p className="text-lg text-yellow-300">
                        Your access will be restored in approximately <b>{daysRemaining(banExpiresDate, now)} days</b>.
                    </p>
                )}
                
                <div className="text-left bg-gray-900 p-4 rounded-lg space-y-3">
                    <p>
                        <b><u>Ban Reason:</u></b> {user.ban_reason || 'No reason provided.'}
                    </p>

                    {banExpiresDate && (
                         <p>
                            <b><u>Ban Expires:</u></b> {banExpiresDate.toLocaleString()}
                        </p>
                    )}
                    
                    <p>
                        <b><u>Appealing:</u></b> If you think you have been wrongly banned please visit the ban appeals tab of the discord linked below
                    </p>
                </div>

                <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
                    <a 
                        href={appConfig?.discordInviteUrl || '#'}
                        target="_blank" 
                        rel="noopener noreferrer" 
                        className="w-full sm:w-auto px-8 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg transition"
                    >
                        Discord
                    </a>
                    <button 
                        onClick={logout} 
                        className="w-full sm:w-auto px-8 py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg transition"
                    >
                        Log Out
                    </button>
                </div>
            </div>
        </div>
    );
};

export default BanNotice;
