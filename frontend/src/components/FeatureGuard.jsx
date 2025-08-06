import React from 'react';
import { useAuth } from '../context/AuthContext';

const FeatureGuard = ({ featureName, children }) => {
    const { user } = useAuth();
    const status = user?.systemStatus?.[featureName];

    if (!status?.isEnabled) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-gray-900 text-white">
                <div className="w-full max-w-2xl p-8 space-y-6 bg-gray-800/50 rounded-xl shadow-lg border-2 border-yellow-700 text-center">
                    <h1 className="text-4xl font-black text-yellow-400">Feature Unavailable</h1>
                    <p className="text-lg text-gray-300">
                        {status.message || 'This part of the platform is temporarily disabled. Please check back later.'}
                    </p>
                </div>
            </div>
        );
    }

    return <>{children}</>;
};

export default FeatureGuard;
