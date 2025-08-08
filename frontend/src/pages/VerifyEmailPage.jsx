import React, { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import * as api from '../services/api';

const Loader = () => (
    <div className="w-8 h-8 border-4 border-white border-t-transparent rounded-full animate-spin"></div>
);

const VerifyEmailPage = () => {
    const [searchParams] = useSearchParams();
    const [verificationStatus, setVerificationStatus] = useState('verifying');
    const [message, setMessage] = useState('Verifying your account...');

    useEffect(() => {
        const token = searchParams.get('token');

        if (!token) {
            setVerificationStatus('error');
            setMessage('No verification token found. The link may be invalid.');
            return;
        }

        const verifyToken = async () => {
            try {
                const result = await api.verifyEmail(token);
                setVerificationStatus('success');
                setMessage(result.message);
            } catch (error) {
                setVerificationStatus('error');
                setMessage(error.message || 'An unknown error occurred during verification.');
            }
        };

        verifyToken();
    }, [searchParams]);

    return (
        <div className="flex items-center justify-center min-h-screen bg-gray-900">
            <div className="w-full max-w-md p-8 space-y-6 bg-[var(--widget-bg)] rounded-xl shadow-lg border border-[var(--widget-border)] text-center">
                
                {verificationStatus === 'verifying' && <Loader />}
                
                {verificationStatus === 'success' && <h1 className="text-3xl font-bold text-green-400">Verification Successful!</h1>}
                
                {verificationStatus === 'error' && <h1 className="text-3xl font-bold text-red-400">Verification Failed</h1>}
                
                <p className="text-gray-300 text-lg">{message}</p>
                
                {(verificationStatus === 'success' || verificationStatus === 'error') && (
                    <Link to="/signin" className="inline-block w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-lg transition-transform transform hover:scale-105 mt-4">
                        Proceed to Sign In
                    </Link>
                )}
            </div>
        </div>
    );
};

export default VerifyEmailPage;
