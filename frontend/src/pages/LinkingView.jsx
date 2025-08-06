import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom'; // Import useNavigate
import { useAuth } from '../context/AuthContext';
import * as api from '../services/api';

const LinkingView = () => {
    const { user, token, refreshUser } = useAuth();
    const navigate = useNavigate(); // Initialize the navigate function
    const [robloxUsername, setRobloxUsername] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [message, setMessage] = useState({ text: '', type: '' });

    const handleVerify = async (e) => {
        e.preventDefault();
        setIsLoading(true);
        setMessage({ text: '', type: '' });
        try {
            const data = await api.verifyRobloxAccount(robloxUsername, token);
            setMessage({ text: data.message, type: 'success' });
            
            // Refresh user data to get the new linked status
            await refreshUser(); 
            
            // On success, navigate to the dashboard after a short delay
            setTimeout(() => {
                navigate('/dashboard');
            }, 1500);

        } catch (err) {
            setMessage({ text: err.message, type: 'error' });
        } finally {
            setIsLoading(false);
        }
    };

    const copyPhrase = () => {
        if (user?.verification_phrase) {
            navigator.clipboard.writeText(user.verification_phrase);
            setMessage({ text: 'Copied to clipboard!', type: 'success' });
            setTimeout(() => setMessage({ text: '', type: '' }), 2000);
        }
    };

    return (
        <div className="flex items-center justify-center min-h-screen bg-gray-900">
            <div className="w-full max-w-lg p-8 space-y-6 bg-[var(--widget-bg)] rounded-xl shadow-lg border border-[var(--widget-border)] text-center">
                <h1 className="text-3xl font-bold text-white">Link Your Roblox Account</h1>
                <p className="text-gray-400">To participate in duels, you need to verify your Roblox account.</p>
                
                {message.text && <div className={`p-3 rounded-lg ${message.type === 'success' ? 'bg-green-500/20 text-green-300' : 'bg-red-500/20 text-red-300'}`}>{message.text}</div>}

                <div className="text-left space-y-2">
                    <p className="text-gray-300">1. Copy the unique phrase below.</p>
                    <p className="text-gray-300">2. Paste it anywhere in your Roblox profile's "About" section.</p>
                    <p className="text-gray-300">3. Enter your username and click "Verify".</p>
                </div>

                <div className="bg-gray-900 border border-dashed border-gray-600 p-4 rounded-lg font-mono text-[var(--accent-color)] cursor-pointer transition-transform transform hover:scale-105 mb-6" onClick={copyPhrase}>
                    {user?.verification_phrase || 'Loading phrase...'}
                </div>

                <form onSubmit={handleVerify}>
                    <div className="mb-4 text-left">
                        <label className="block text-sm font-medium text-gray-300 mb-1">Your Roblox Username</label>
                        <input type="text" value={robloxUsername} onChange={e => setRobloxUsername(e.target.value)} required className="w-full px-4 py-2 bg-gray-900 border border-gray-600 rounded-lg focus:ring-2 focus:ring-[var(--accent-color)] focus:border-[var(--accent-color)] outline-none transition text-white" placeholder="Enter your Roblox username..." />
                    </div>
                    <button type="submit" disabled={isLoading} className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-4 rounded-lg transition-transform transform hover:scale-105 disabled:bg-green-400 disabled:cursor-not-allowed flex items-center justify-center">
                        {isLoading ? <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : 'Verify Account'}
                    </button>
                </form>
            </div>
        </div>
    );
};

export default LinkingView;
