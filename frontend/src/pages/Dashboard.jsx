import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import * as api from '../services/api';
import { useNavigate } from 'react-router-dom';

// Import all our modular components
import PlayerHeader from '../components/Dashboard/PlayerHeader';
import ChallengePlayer from '../components/Dashboard/ChallengePlayer';
import Inbox from '../components/Dashboard/Inbox';
import { ChallengeModal, DuelDetailsModal, ConfirmationModal, TranscriptModal, PostDuelModal } from '../components/Dashboard/Modals';

// --- Reusable Helper Components ---
const Loader = ({ fullScreen = false }) => (
    <div className={`flex items-center justify-center ${fullScreen ? 'fixed inset-0 bg-black bg-opacity-70 z-50' : ''}`}>
        <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
    </div>
);
const Toast = ({ message, type, onDismiss }) => {
    useEffect(() => {
        const timer = setTimeout(onDismiss, 4000);
        return () => clearTimeout(timer);
    }, [onDismiss]);
    const style = type === 'success' ? 'bg-green-500' : 'bg-red-500';
    return <div className={`fixed top-5 right-5 p-4 rounded-lg text-white font-bold shadow-lg z-50 ${style}`}>{message}</div>;
};

const BanNotification = ({ reason, expiresAt }) => {
    const formattedDate = expiresAt ? new Date(expiresAt).toLocaleString() : 'Permanent';
    return (
        <div className="bg-red-900/50 border-2 border-red-700 p-4 rounded-lg mb-8 text-center">
            <h2 className="text-2xl font-bold text-red-300">You Are Banned</h2>
            <p className="text-red-400 mt-2"><strong>Reason:</strong> {reason || 'No reason provided.'}</p>
            <p className="text-red-400 mt-1"><strong>Expires:</strong> {formattedDate}</p>
        </div>
    );
};

const Sidebar = ({ isOpen, onClose }) => {
    const navigate = useNavigate();
    const handleNavigate = (path) => {
        navigate(path);
        onClose();
    };
    return (
        <>
            <div 
                className={`fixed inset-0 bg-black z-30 transition-opacity duration-300 ${isOpen ? 'bg-opacity-60' : 'bg-opacity-0 pointer-events-none'}`}
                onClick={onClose}
            ></div>
            <div className={`fixed top-0 left-0 h-full w-64 bg-[#161b22] border-r border-[var(--widget-border)] shadow-2xl z-40 transform transition-transform duration-300 ease-in-out ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}>
                <div className="p-4">
                    <h2 className="text-xl font-bold text-white mb-6">Navigation</h2>
                    <nav className="flex flex-col space-y-2">
                        <button onClick={() => handleNavigate('/duel-history')} className="text-left text-gray-300 hover:bg-gray-700/50 hover:text-white p-3 rounded-lg transition-colors">
                            Duel History
                        </button>
                        <button onClick={() => handleNavigate('/deposit')} className="text-left text-gray-300 hover:bg-gray-700/50 hover:text-white p-3 rounded-lg transition-colors">
                            Deposit
                        </button>
                        <button onClick={() => handleNavigate('/withdraw')} className="text-left text-gray-300 hover:bg-gray-700/50 hover:text-white p-3 rounded-lg transition-colors">
                            Withdraw
                        </button>
                        <button onClick={() => handleNavigate('/history')} className="text-left text-gray-300 hover:bg-gray-700/50 hover:text-white p-3 rounded-lg transition-colors">
                            Transaction History
                        </button>
                    </nav>
                </div>
            </div>
        </>
    );
};


// --- Main Dashboard Component ---
const Dashboard = () => {
    const { user, token, refreshUser, isLoading: isAuthLoading } = useAuth();
    
    const [notifications, setNotifications] = useState([]);
    const [gameData, setGameData] = useState({ maps: [], weapons: [] });
    const [transcript, setTranscript] = useState([]);
    const [unseenResult, setUnseenResult] = useState(null);
    
    const [isDashboardLoading, setIsDashboardLoading] = useState(true);
    const [message, setMessage] = useState({ text: '', type: '' });
    const [selectedItem, setSelectedItem] = useState(null);
    const [challengeTarget, setChallengeTarget] = useState(null);
    
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    
    const [isChallengeModalOpen, setChallengeModalOpen] = useState(false);
    const [isDetailsModalOpen, setDetailsModalOpen] = useState(false);
    const [isCancelDuelModalOpen, setIsCancelDuelModalOpen] = useState(false);
    const [isTranscriptModalOpen, setIsTranscriptModalOpen] = useState(false);
    const [isForfeitModalOpen, setIsForfeitModalOpen] = useState(false);
    const [isCancelWithdrawalModalOpen, setIsCancelWithdrawalModalOpen] = useState(false);

    const showMessage = (text, type = 'success') => {
        setMessage({ text, type });
    };

    const fetchData = useCallback(async () => {
        if (!token) return;
        try {
            const [inboxRes, gameDataRes] = await Promise.all([
                api.getInbox(token),
                api.getGameData(token)
            ]);
            setNotifications(inboxRes);
            setGameData(gameDataRes);
        } catch (error) { 
            showMessage(error.message, 'error'); 
        } finally {
            setIsDashboardLoading(false);
        }
    }, [token]);

    useEffect(() => {
        fetchData();
        const interval = setInterval(fetchData, 15000);
        return () => clearInterval(interval);
    }, [fetchData]);

    useEffect(() => {
        const checkForResults = async () => {
            if (!token || unseenResult) return;
            try {
                const results = await api.getUnseenResults(token);
                if (results.length > 0) {
                    setUnseenResult(results[0]);
                }
            } catch (error) {
                console.error("Error checking for unseen results:", error);
            }
        };
        const resultInterval = setInterval(checkForResults, 3000);
        return () => clearInterval(resultInterval);
    }, [token, unseenResult]);

    const handleChallengePlayer = (player) => { setChallengeTarget(player); setChallengeModalOpen(true); };
    const handleChallengeSubmit = async (challengeData) => { try { const r = await api.sendChallenge(challengeData, token); showMessage(r.message, 'success'); setChallengeModalOpen(false); fetchData(); } catch (e) { showMessage(e.message, 'error'); } };
    const handleViewDetails = (duelNotificationObject) => { setSelectedItem(duelNotificationObject); setDetailsModalOpen(true); };
    const handleCancelDuelClick = (duelNotificationObject) => { setSelectedItem(duelNotificationObject); setIsCancelDuelModalOpen(true); };
    const handleConfirmCancelDuel = async () => { if (!selectedItem?.data) return; try { const r = await api.cancelDuel(selectedItem.data.id, token); showMessage(r.message, 'success'); setIsCancelDuelModalOpen(false); fetchData(); } catch (e) { showMessage(e.message, 'error'); } };
    const handleRespondToDuel = async (duelId, response) => { try { const r = await api.respondToDuel({ duel_id: duelId, response }, token); showMessage(r.message, 'success'); setDetailsModalOpen(false); fetchData(); } catch (e) { showMessage(e.message, 'error'); } };
    const handleViewTranscript = async (duelId) => { setTranscript([]); setIsTranscriptModalOpen(true); try { const d = await api.getTranscript(duelId, token); setTranscript(d); } catch (e) { showMessage(e.message, 'error'); } };
    const handleStartDuel = async (duel) => { try { const r = await api.startDuel(duel.id, token); showMessage(r.message, 'success'); if (r.serverLink) { window.open(r.serverLink, '_blank'); } else { showMessage("Server link not found.", "error"); } fetchData(); } catch (e) { showMessage(e.message, 'error'); } };
    const handleForfeitClick = (duelNotificationObject) => { setSelectedItem(duelNotificationObject); setIsForfeitModalOpen(true); };
    const handleConfirmForfeit = async () => { if (!selectedItem?.data) return; try { const r = await api.forfeitDuel(selectedItem.data.id, token); showMessage(r.message, 'success'); setIsForfeitModalOpen(false); fetchData(); } catch (e) { showMessage(e.message, 'error'); setIsForfeitModalOpen(false); } };
    const handleConfirmResult = async (duelId) => { try { await api.confirmDuelResult(duelId, token); setUnseenResult(null); await refreshUser(); fetchData(); } catch (e) { showMessage(e.message, 'error'); setUnseenResult(null); } };
    const handleFileDispute = async (duelId, disputeData) => { try { const r = await api.fileDispute(duelId, disputeData, token); showMessage(r.message, 'success'); setUnseenResult(null); fetchData(); } catch (e) { showMessage(e.message, 'error'); setUnseenResult(null); } };
    const handleCancelWithdrawalClick = (req) => { setSelectedItem({ data: req }); setIsCancelWithdrawalModalOpen(true); };
    const handleConfirmCancelWithdrawal = async () => { if (!selectedItem?.data) return; try { const r = await api.cancelWithdrawalRequest(selectedItem.data.id, token); showMessage(r.message, 'success'); setIsCancelWithdrawalModalOpen(false); await refreshUser(); fetchData(); } catch (e) { showMessage(e.message, 'error'); setIsCancelWithdrawalModalOpen(false); } };

    if (isAuthLoading || !user) {
        return <Loader fullScreen />;
    }
    if (isDashboardLoading) {
        return <Loader fullScreen />;
    }

    return (
        <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
            <Sidebar isOpen={isSidebarOpen} onClose={() => setIsSidebarOpen(false)} />
            {message.text && <Toast message={message.text} type={message.type} onDismiss={() => setMessage({ text: '', type: '' })} />}
            {user.status === 'banned' && <BanNotification reason={user.ban_reason} expiresAt={user.ban_expires_at} />}
            <PlayerHeader user={user} onMenuClick={() => setIsSidebarOpen(true)} />
            
            <div className="dashboard-grid">
                <main className="main-content space-y-8">
                    <ChallengePlayer token={token} onChallenge={handleChallengePlayer} onError={showMessage} isBanned={user.status === 'banned'} />
                </main>
                <aside className="sidebar space-y-8">
                    <Inbox notifications={notifications} onViewDuel={handleViewDetails} onCancelDuel={handleCancelDuelClick} onStartDuel={handleStartDuel} onForfeitDuel={handleForfeitClick} onCancelWithdrawal={handleCancelWithdrawalClick} />
                </aside>
            </div>

            <ChallengeModal isOpen={isChallengeModalOpen} onClose={() => setChallengeModalOpen(false)} opponent={challengeTarget} currentUser={user} gameData={gameData} onChallengeSubmit={handleChallengeSubmit} onError={showMessage} token={token}/>
            <DuelDetailsModal isOpen={isDetailsModalOpen} onClose={() => setDetailsModalOpen(false)} duel={selectedItem} onRespond={handleRespondToDuel} />
            <ConfirmationModal isOpen={isCancelDuelModalOpen} onClose={() => setIsCancelDuelModalOpen(false)} onConfirm={handleConfirmCancelDuel} title="Cancel Duel?" text="Are you sure you want to cancel this duel?" confirmText="Yes, Cancel"/>
            <ConfirmationModal isOpen={isForfeitModalOpen} onClose={() => setIsForfeitModalOpen(false)} onConfirm={handleConfirmForfeit} title="Forfeit Duel?" text={`You will lose ${selectedItem?.data?.wager || 0} gems.`} confirmText="Yes, Forfeit"/>
            <ConfirmationModal isOpen={isCancelWithdrawalModalOpen} onClose={() => setIsCancelWithdrawalModalOpen(false)} onConfirm={handleConfirmCancelWithdrawal} title="Cancel Withdrawal?" text={`Your ${selectedItem?.data?.amount_gems || 0} gems will be returned.`} confirmText="Yes, Cancel Request"/>
            <TranscriptModal isOpen={isTranscriptModalOpen} onClose={() => setIsTranscriptModalOpen(false)} transcript={transcript} />
            <PostDuelModal isOpen={!!unseenResult} result={unseenResult} currentUser={user} onConfirm={handleConfirmResult} onDispute={handleFileDispute}/>
        </div>
    );
};

export default Dashboard;
