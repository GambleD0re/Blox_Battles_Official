import React from 'react';
import { Link } from 'react-router-dom';

const ForbiddenPage = () => {
    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-gray-900 text-white text-center p-4">
            <h1 className="text-8xl font-black text-red-500 drop-shadow-[0_0_15px_rgba(248,81,73,0.4)]">403</h1>
            <h2 className="mt-4 text-3xl font-bold">Access Denied</h2>
            <p className="mt-2 text-lg text-gray-400">
                You do not have the necessary permissions to access this page.
            </p>
            <div className="mt-8 flex items-center gap-4">
                <Link to="/dashboard" className="btn btn-secondary !mt-0 !bg-gray-700 hover:!bg-gray-600">
                    Go to Dashboard
                </Link>
                <a 
                    href="https://discord.gg/your-invite-link" // Replace with your actual Discord invite link
                    target="_blank" 
                    rel="noopener noreferrer" 
                    className="btn btn-primary !mt-0 !bg-blue-600 hover:!bg-blue-700"
                >
                    Join our Discord
                </a>
            </div>
        </div>
    );
};

export default ForbiddenPage;
