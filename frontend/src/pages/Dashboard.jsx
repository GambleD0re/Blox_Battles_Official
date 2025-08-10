import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import * as api from '../services/api';

import PlayerHeader from '../components/Dashboard/PlayerHeader';
import ChallengePlayer from '../components/Dashboard/ChallengePlayer';
import Inbox from '../components/Dashboard/Inbox';
import { ChallengeModal, DuelDetailsModal, ConfirmationModal, TranscriptModal, PostDuelModal } from '../components/Dashboard/Modals';

const Dashboard = () => {
    const { user, token, refreshUser } = useAuth();

    const [inboxNotifications, setInboxNotifications] = useState([]);
    const [gameData, setGameData] = useState({ maps: [], weapons: [], regions: [] });
    const [unseenResults, setUnseenResults] = useState([]);

    const [isLoading, setIsLoading] = useState(true);
    const [message, setMessage] = useState({ text: '', type: '' });
    const [isChallengeModalOpen, setChallengeModalOpen] = useState(false);
    const [isDetailsModalOpen, setDetailsModalOpen] = useState(false);
    const [isActiveDetailsModalOpen, setActiveDetailsModalOpen] = useState(false);
    const [isForfeitModalOpen, setForfeitModalOpen] = useState(false);
    const [isCancelModalOpen, setCancelModalOpen] = useState(false);
    const [isTranscriptModalOpen, setTranscriptModalOpen] = useState(false);
    
    const [selectedOpponent, setSelectedOpponent] = useState(null);
    const [selectedDuel, setSelectedDuel] = useState(null);
    const [selectedTranscript, setSelectedTranscript] = useState(null);

    const showMessage = (text, type = 'success') => {
        setMessage({ text, type });
        setTimeout(() => setMessage({ text: '', type: '' }), 5000);
    };

    const fetchDashboardData = useCallback(async () => {
        setIsLoading(true);
        try {
            const [inboxData, gameData, unseenResultsData] = await Promise.all([
                api.getInbox(token),
                api.getGameData(token),
                api.getUnseenResults(token)
            ]);
            setInboxNotifications(inboxData);
            setGameData(gameData);
            setUnseenResults(unseenResultsData);
        } catch (error) {
            showMessage(error.message, 'error');
        } finally {
            setIsLoading(false);
        }
    }, [token]);

    useEffect(() => {
        fetchDashboardData();
    }, [fetchDashboardData]);

    const handleChallengePlayer = (opponent) => {
        setSelectedOpponent(opponent);
        setChallengeModalOpen(true);
    };
    
    const handleViewDuel = (duel) => {
        setSelectedDuel(duel);
        setDetailsModalOpen(true);
    };

    const handleViewActiveDuel = (duel) => {
        setSelectedDuel({ data: duel });
        setActiveDetailsModalOpen(true);
    };
    
    const handleOpenForfeitModal = (duel) => {
        setSelectedDuel(duel);
        setForfeitModalOpen(true);
    };

    const handleOpenCancelModal = (duel) => {
        setSelectedDuel(duel);
        setCancelModalOpen(true);
    };

    const handleViewTranscript = async (duelId) => {
        try {
            const transcriptData = await api.getTranscript(duelId, token);
            setSelectedTranscript(transcriptData);
            setTranscriptModalOpen(true);
        } catch (error) {
            showMessage(error.message, 'error');
        }
    };

    const handleChallengeSubmit = async (challengeData) => {
        try {
            const result = await api.sendChallenge(challengeData, token);
            showMessage(result.message, 'success');
            setChallengeModalOpen(false);
            fetchDashboardData();
        } catch (error) {
            showMessage(error.message, 'error');
        }
    };
    
    const handleRespondToDuel = async (duelId, response) => {
        try {
            const result = await api.respondToDuel({ duel_id: duelId, response }, token);
            showMessage(result.message, 'success');
            setDetailsModalOpen(false);
            refreshUser();
            fetchDashboardData();
        } catch (error) {
            showMessage(error.message, 'error');
        }
    };

    const handleStartDuel = async (duel) => {
        try {
            const result = await api.startDuel(duel.id, token);
            showMessage(result.message, 'success');
            fetchDashboardData();
        } catch(error) {
            showMessage(error.message, 'error');
        }
    };
    
    const handleConfirmForfeit = async () => {
        try {
            const result = await api.forfeitDuel(selectedDuel.data.id, token);
            showMessage(result.message, 'success');
            setForfeitModalOpen(false);
            refreshUser();
            fetchDashboardData();
        } catch (error) {
            showMessage(error.message, 'error');
        }
    };
    
    const handleConfirmCancel = async () => {
        try {
            const result = await api.cancelDuel(selectedDuel.data.id, token);
            showMessage(result.message, 'success');
            setCancelModalOpen(false);
            fetchDashboardData();
        } catch (error) {
            showMessage(error.message, 'error');
        }
    };

    const handleConfirmResult = async (duelId) => {
        try {
            await api.confirmDuelResult(duelId, token);
            setUnseenResults(prev => prev.filter(r => r.id !== duelId));
            showMessage('Result confirmed!', 'success');
            refreshUser();
        } catch (error) {
            showMessage(error.message, 'error');
        }
    };
    
    const handleDisputeResult = async (duelId, disputeData) => {
        try {
            const result = await api.fileDispute(duelId, disputeData, token);
            showMessage(result.message, 'success');
            setUnseenResults(prev => prev.filter(r => r.id !== duelId));
            fetchDashboardData();
        } catch (error) {
            showMessage(error.message, 'error');
        }
    };

    if (isLoading) {
        return <div className="flex items-center justify-center min-h-screen">Loading Dashboard...</div>;
    }

    return (
        <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
            {message.text && (
                <div className={`fixed top-5 right-5 p-4 rounded-lg text-white font-bold shadow-lg z-50 ${message.type === 'success' ? 'bg-green-500' : 'bg-red-500'}`}>
                    {message.text}
                </div>
            )}
            
            <PlayerHeader user={user} />

            <main className="dashboard-grid mt-8">
                <div className="space-y-6">
                    <ChallengePlayer token={token} onChallenge={handleChallengePlayer} />
                </div>
                <div className="space-y-6">
                    <Inbox 
                        notifications={inboxNotifications}
                        onViewDuel={handleViewDuel}
                        onCancelDuel={handleOpenCancelModal}
                        onStartDuel={handleStartDuel}
                        onForfeitDuel={handleOpenForfeitModal}
                        onViewActiveDuelDetails={handleViewActiveDuel}
                    />
                </div>
            </main>

            <ChallengeModal 
                isOpen={isChallengeModalOpen} 
                onClose={() => setChallengeModalOpen(false)}
                opponent={selectedOpponent}
                currentUser={user}
                gameData={gameData}
                onChallengeSubmit={handleChallengeSubmit}
                onError={(msg) => showMessage(msg, 'error')}
            />
            <DuelDetailsModal 
                isOpen={isDetailsModalOpen} 
                onClose={() => setDetailsModalOpen(false)}
                duel={selectedDuel}
                onRespond={handleRespondToDuel}
            />
            <DuelDetailsModal
                isOpen={isActiveDetailsModalOpen}
                onClose={() => setActiveDetailsModalOpen(false)}
                duel={selectedDuel}
                isViewingOnly={true}
            />
            <ConfirmationModal
                isOpen={isForfeitModalOpen}
                onClose={() => setForfeitModalOpen(false)}
                onConfirm={handleConfirmForfeit}
                title="Forfeit Duel?"
                text="Are you sure you want to forfeit? This action cannot be undone and your wager will be lost."
                confirmText="Yes, Forfeit"
            />
            <ConfirmationModal
                isOpen={isCancelModalOpen}
                onClose={() => setCancelModalOpen(false)}
                onConfirm={handleConfirmCancel}
                title="Cancel Challenge?"
                text="Are you sure you want to cancel this pending challenge?"
                confirmText="Yes, Cancel"
            />
             <TranscriptModal 
                isOpen={isTranscriptModalOpen} 
                onClose={() => setTranscriptModalOpen(false)} 
                transcript={selectedTranscript} 
            />
            {(unseenResults || []).map(result => (
                <PostDuelModal 
                    key={result.id}
                    isOpen={true}
                    result={result}
                    currentUser={user}
                    onConfirm={handleConfirmResult}
                    onDispute={handleDisputeResult}
                />
            ))}
        </div>
    );
};

export default Dashboard;
