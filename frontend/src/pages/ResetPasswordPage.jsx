import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import * as api from '../services/api';

const ResetPasswordPage = () => {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const [token, setToken] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [message, setMessage] = useState({ text: '', type: '' });
    const [isLoading, setIsLoading] = useState(false);
    const [isSuccess, setIsSuccess] = useState(false);

    useEffect(() => {
        const urlToken = searchParams.get('token');
        if (!urlToken) {
            setMessage({ text: 'No reset token provided. Please request a new link.', type: 'error' });
        }
        setToken(urlToken);
    }, [searchParams]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setMessage({ text: '', type: '' });

        if (password !== confirmPassword) {
            setMessage({ text: 'Passwords do not match.', type: 'error' });
            return;
        }

        setIsLoading(true);
        try {
            const result = await api.resetPassword(token, password);
            setMessage({ text: result.message, type: 'success' });
            setIsSuccess(true);
            setTimeout(() => navigate('/signin'), 3000);
        } catch (error) {
            setMessage({ text: error.message, type: 'error' });
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="flex items-center justify-center min-h-screen bg-gray-900">
            <div className="w-full max-w-md p-8 space-y-8 bg-[var(--widget-bg)] rounded-xl shadow-lg border border-[var(--widget-border)] text-center">
                <h1 className="text-3xl font-bold text-white">Set a New Password</h1>
                
                {message.text && <div className={`p-3 rounded-lg ${message.type === 'success' ? 'bg-green-500/20 text-green-300' : 'bg-red-500/20 text-red-300'}`}>{message.text}</div>}

                {!isSuccess ? (
                    <form onSubmit={handleSubmit} className="space-y-6 text-left">
                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-1">New Password</label>
                            <input type="password" value={password} onChange={e => setPassword(e.target.value)} required className="w-full px-4 py-2 bg-gray-900 border border-gray-600 rounded-lg focus:ring-2 focus:ring-[var(--accent-color)] focus:border-[var(--accent-color)] outline-none transition text-white" placeholder="••••••••" />
                            <p className="text-xs text-gray-500 mt-1">Must be 8+ characters with a number and special character.</p>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-300 mb-1">Confirm New Password</label>
                            <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required className="w-full px-4 py-2 bg-gray-900 border border-gray-600 rounded-lg focus:ring-2 focus:ring-[var(--accent-color)] focus:border-[var(--accent-color)] outline-none transition text-white" placeholder="••••••••" />
                        </div>
                        <button type="submit" disabled={isLoading || !token} className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-4 rounded-lg transition-transform transform hover:scale-105 disabled:bg-green-400 disabled:cursor-not-allowed flex items-center justify-center">
                            {isLoading ? <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : 'Update Password'}
                        </button>
                    </form>
                ) : (
                    <p className="text-gray-300">Redirecting to the sign-in page...</p>
                )}

                <p className="mt-8 text-sm text-gray-400">
                    <Link to="/signin" className="font-medium text-[var(--accent-color)] hover:underline">Back to Sign In</Link>
                </p>
            </div>
        </div>
    );
};

export default ResetPasswordPage;
