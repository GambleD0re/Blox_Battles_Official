import React from 'react';

const QuickMatchWidget = ({ onJoinClick }) => {
    return (
        <div className="widget">
            <h2 className="widget-title">Quick Match</h2>
            <p className="text-gray-400 mb-4">Enter a queue to be automatically matched against another player with a similar wager.</p>
            <button onClick={onJoinClick} className="btn btn-primary w-full">
                Join Random Queue
            </button>
        </div>
    );
};

export default QuickMatchWidget;
