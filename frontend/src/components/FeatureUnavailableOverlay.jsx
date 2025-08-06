import React from 'react';

const LockIcon = () => (
    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
        <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
    </svg>
);

const FeatureUnavailableOverlay = ({ message }) => {
    return (
        <div className="absolute inset-0 bg-black bg-opacity-70 backdrop-blur-sm flex flex-col items-center justify-center text-center p-4 z-10 rounded-lg">
            <LockIcon />
            <h4 className="mt-2 text-lg font-bold text-yellow-300">Feature Unavailable</h4>
            <p className="text-sm text-gray-300">{message || 'This feature is temporarily disabled by an administrator.'}</p>
        </div>
    );
};

export default FeatureUnavailableOverlay;
