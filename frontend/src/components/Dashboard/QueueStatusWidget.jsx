import React, { useState, useEffect } from 'react';
import * as api from '../../services/api';

const Timer = ({ startTime }) => {
    const [elapsed, setElapsed] = useState(0);

    useEffect(() => {
        const start = new Date(startTime).getTime();
        const interval = setInterval(() => {
            setElapsed(Date.now() - start);
        }, 1000);
        return () => clearInterval(interval);
    }, [startTime]);

    const totalSeconds = Math.floor(elapsed / 1000);
    const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
    const seconds = (totalSeconds % 60).toString().padStart(2, '0');

    return <span className="font-mono">{minutes}:{seconds}</span>;
};

const QueueStatusWidget = ({ queueStatus, token, showMessage, onQueueLeft }) => {
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleLeaveQueue = async () => {
        setIsSubmitting(true);
        try {
            await api.leaveQueue(token);
            showMessage('You have left the queue.', 'success');
            onQueueLeft();
        } catch (error) {
            showMessage(error.message, 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="widget text-center">
            <h2 className="widget-title">Searching for Match...</h2>
            <div className="flex items-center justify-center gap-4 my-4">
                <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                <div className="text-3xl font-bold text-white"><Timer startTime={queueStatus.created_at} /></div>
            </div>
            <p className="text-gray-400">Wager: {queueStatus.wager} Gems | Region: {queueStatus.region}</p>
            <button onClick={handleLeaveQueue} disabled={isSubmitting} className="btn btn-danger w-full mt-4">
                {isSubmitting ? 'Leaving...' : 'Leave Queue'}
            </button>
        </div>
    );
};

export default QueueStatusWidget;
