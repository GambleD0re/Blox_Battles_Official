import React, { useState } from 'react';
import { useLocation, Link } from 'react-router-dom';
import * as api from '../services/api';

const VerificationNoticePage = () => {
    const location = useLocation();
    const [message, setMessage] = useState({ text: '', type: '' });
    const [isLoading, setIsLoading] = useState(false);
    
    const email = location.state?.email || '';

    const handleResend = async () => {
        if (!email) {
            setMessage({ text: 'Could not find an email to resend to. Please try logging in again.', type: 'error' });
            return;
        }
        setIsLoading(true);
        setMessage({ text: '', type: '' });
        try {
            const result = await api.resendVerificationEmail(email);
            setMessage({ text: result.message, type: 'success' });
        } catch (error) {
            setMessage({ text: error.message, type: 'error' });
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="flex items-center justify-center min-h-screen bg-gray-900">
            <div className="w-full max-w-lg p-8 space-y-6 bg-[var(--widget-bg)] rounded-xl shadow-lg border border-[var(--widget-border)] text-center">
                <h1 className="text-3xl font-bold text-white">Check Your Email</h1>
                <p className="text-gray-400">
                    A verification link has been sent to <strong>{email || 'your email address'}</strong>. Please click the link to activate your account before logging in.
                </p>
                
                {message.text && <div className={`p-3 rounded-lg ${message.type === 'success' ? 'bg-green-500/20 text-green-300' : 'bg-red-500/20 text-red-300'}`}>{message.text}</div>}

                <div className="mt-6">
                    <p className="text-sm text-gray-500">Didn't receive the email? Check your spam folder or click below to resend.</p>
                    <button 
                        onClick={handleResend} 
                        disabled={isLoading || !email}
                        className="w-full mt-2 bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-lg transition-transform transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                    >
                        {isLoading ? <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin"></div> : 'Resend Verification Link'}
                    </button>
                </div>

                <p className="mt-8 text-sm text-gray-400">
                    <Link to="/signin" className="font-medium text-[var(--accent-color)] hover:underline">Back to Sign In</Link>
                </p>
            </div>
        </div>
    );
};

export default VerificationNoticePage;
