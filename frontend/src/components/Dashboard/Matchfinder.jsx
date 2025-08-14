import React, { useState } from 'react';
import ChallengePlayer from './ChallengePlayer';
import RandomQueue from './RandomQueue';

const TabButton = ({ active, onClick, children }) => (
    <button
        onClick={onClick}
        className={`px-4 py-2 text-sm font-semibold rounded-t-lg border-b-2 transition-colors ${
            active 
            ? 'border-blue-500 text-white' 
            : 'border-transparent text-gray-400 hover:text-white hover:border-gray-600'
        }`}
    >
        {children}
    </button>
);

const Matchfinder = ({ token, onChallenge, gameData, showMessage }) => {
    const [activeTab, setActiveTab] = useState('direct');

    return (
        <div className="widget flex flex-col">
            <div className="border-b border-gray-700 flex-shrink-0">
                <TabButton active={activeTab === 'direct'} onClick={() => setActiveTab('direct')}>
                    Direct Challenge
                </TabButton>
                <TabButton active={activeTab === 'random'} onClick={() => setActiveTab('random')}>
                    Random Queue
                </TabButton>
            </div>
            <div className="flex-grow pt-4">
                {activeTab === 'direct' && (
                    <ChallengePlayer 
                        token={token} 
                        onChallenge={onChallenge} 
                    />
                )}
                {activeTab === 'random' && (
                    <RandomQueue 
                        gameData={gameData} 
                        token={token} 
                        showMessage={showMessage} 
                    />
                )}
            </div>
        </div>
    );
};

export default Matchfinder;
