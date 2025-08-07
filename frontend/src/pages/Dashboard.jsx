import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import * as api from '../services/api';
import UserActionsModal from '../components/Admin/UserActionsModal';
import { ConfirmationModal, TranscriptModal } from '../components/Dashboard/Modals';

// --- Helper Components ---
const StatCard = ({ title, value, icon }) => (
    <div className="widget flex items-center p-4 gap-4">
        <div className="text-3xl">{icon}</div>
        <div>
            <div className="text-2xl font-bold text-white">{value}</div>
            <div className="text-sm text-gray-400">{title}</div>
        </div>
    </div>
);

const UserRow = ({ user, onSelectUser }) => {
    const statusStyles = {
        active: 'bg-green-800 text-green-200',
        banned: 'bg-red-800 text-red-200',
        terminated: 'bg-gray-700 text-gray-300',
    };

    const daysSince = (dateString) => {
        if (!dateString) return '';
        const banDate = new Date(dateString);
        const today = new Date();
        const differenceInTime = today.getTime() - banDate.getTime();
        const differenceInDays = Math.floor(differenceInTime / (1000 * 3600 * 24));
        return `(${differenceInDays} days ago)`;
    };
    
    return (
        <tr className="border-b border-gray-700 hover:bg-gray-800/50">
            <td className="p-3">
                <div className="font-semibold text-white">{user.linked_roblox_username || 'N/A'}</div>
                <div className="text-xs text-gray-400">{user.email}</div>
            </td>
            <td className="p-3 text-center">{user.gems}</td>
            <td className="p-3 text-center">{user.wins} / {user.losses}</td>
            <td className="p-3 text-center">
                <span className={`px-2 py-1 text-xs font-semibold rounded-full ${statusStyles[user.status]}`}>
                    {user.status.toUpperCase()}
                </span>
                {user.status === 'banned' && user.ban_expires_at && (
                    <div className="text-xs text-gray-400 mt-1">
                        Expires: {new Date(user.ban_expires_at).toLocaleDateString()}
                    </div>
                )}
                {user.status === 'banned' && !user.ban_expires_at && (
                    <div className="text-xs text-gray-400 mt-1">
                        Permanent {daysSince(user.ban_applied_at)}
                    </div>
                )}
            </td>
            <td className="p-3 text-right">
                <button onClick={() => onSelectUser(user)} className="btn btn-secondary !mt-0 !py-1 !px-3">
                    Manage
                </button>
            </td>
        </tr>
    );
};

const DisputeResolutionModal = ({ isOpen, onClose, dispute, onResolve, onViewTranscript, onForwardToDiscord }) => {
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50 p-4">
            <div className="widget w-full max-w-2xl">
                <header className="p-4 border-b border-gray-700 flex justify-between items-center"><h2 className="text-xl font-bold text-gray-100">Review Dispute #{dispute.id}</h2><button onClick={onClose} className="text-gray-400 hover:text-white">×</button></header>
                <div className="p-6 space-y-4">
                    <div><strong>Reporter:</strong> {dispute.reporter_username}</div>
                    <div><strong>Reported Player:</strong> {dispute.reported_username}</div>
                    <div><strong>Reason:</strong> <p className="p-2 bg-gray-900 rounded-md mt-1">{dispute.reason}</p></div>
                    <div><strong>Has Video Evidence:</strong> {dispute.has_video_evidence ? 'Yes' : 'No'}</div>
                    <button onClick={() => onViewTranscript(dispute.duel_id)} className="btn btn-secondary w-full !mt-4">View Duel Transcript</button>
                    <button 
                        onClick={() => onForwardToDiscord(dispute.id)} 
                        disabled={!dispute.has_video_evidence}
                        className="btn bg-blue-600 hover:bg-blue-700 text-white w-full disabled:bg-gray-500 disabled:cursor-not-allowed"
                    >
                        Forward to Discord
                    </button>
                </div>
                <footer className="p-4 border-t border-gray-700 space-y-2">
                    <h3 className="font-bold text-center">Resolution Actions</h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2"><button onClick={() => onResolve(dispute.id, 'uphold_winner')} className="btn btn-primary">Uphold Original Win</button><button onClick={() => onResolve(dispute.id, 'overturn_to_reporter')} className="btn bg-yellow-600 text-white">Overturn to Reporter</button><button onClick={() => onResolve(dispute.id, 'void_refund')} className="btn btn-secondary">Void & Refund Pot</button></div>
                </footer>
            </div>
        </div>
    );
};

const AdminPayoutDetailModal = ({ isOpen, onClose, requestDetails, onApprove, onDecline }) => {
    if (!isOpen || !requestDetails) return null;
    const { user, duelHistory } = requestDetails;
    return (
        <div className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50 p-4">
            <div className="widget w-full max-w-4xl max-h-[90vh] flex flex-col">
                <header className="p-4 border-b border-gray-700 flex justify-between items-center"><h2 className="text-xl font-bold">Review Payout for {user.linked_roblox_username}</h2><button onClick={onClose} className="text-gray-400 hover:text-white">×</button></header>
                <div className="p-6 overflow-y-auto grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="md:col-span-1 space-y-4">
                        <div className="p-4 bg-gray-900/50 rounded-lg"><h4 className="font-bold text-lg mb-2">User Info</h4><p><strong>Email:</strong> {user.email}</p><p><strong>Member Since:</strong> {new Date(user.created_at).toLocaleDateString()}</p><p><strong>W/L:</strong> {user.wins} / {user.losses}</p></div>
                        <div className="p-4 bg-gray-900/50 rounded-lg"><h4 className="font-bold text-lg mb-2">Balance Impact</h4><p><strong>Balance Before:</strong> {user.balanceBeforeRequest.toLocaleString()} Gems</p><p className="text-red-400"><strong>Withdrawal:</strong> -{requestDetails.request.amount_gems.toLocaleString()} Gems</p><p className="border-t border-gray-700 mt-2 pt-2"><strong>Current Balance:</strong> {user.balanceAfterRequest.toLocaleString()} Gems</p></div>
                    </div>
                    <div className="md:col-span-2">
                        <h4 className="font-bold text-lg mb-2">Recent Duel History (Last 50)</h4>
                        <div className="max-h-96 overflow-y-auto pr-2">
                            <table className="w-full text-sm">
                                <thead><tr className="text-left text-xs text-gray-400 uppercase"><th className="p-2">Outcome</th><th className="p-2">Wager</th><th className="p-2">Tax</th><th className="p-2">Status</th></tr></thead>
                                <tbody>{duelHistory.map(d => (<tr key={d.id} className="border-b border-gray-800"><td className={`p-2 font-bold ${d.winner_id === user.id ? 'text-green-400' : 'text-red-400'}`}>{d.winner_id === user.id ? 'WIN' : 'LOSS'}</td><td className="p-2">{d.wager} Gems</td><td className="p-2 text-yellow-400">{d.tax_collected} Gems</td><td className="p-2">{d.status}</td></tr>))}</tbody>
                            </table>
                        </div>
                    </div>
                </div>
                 <footer className="p-4 border-t border-gray-700 flex justify-end gap-4"><button onClick={() => onDecline(requestDetails.request)} className="btn btn-danger">Decline</button><button onClick={() => onApprove(requestDetails.request.id)} className="btn btn-primary">Approve</button></footer>
            </div>
        </div>
    );
};

const DeclineModal = ({ isOpen, onClose, onSubmit }) => {
    const [reason, setReason] = useState('');
    if (!isOpen) return null;
    const handleSubmit = () => { if (reason.trim()) { onSubmit(reason); } };
    return (
        <div className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50 p-4">
            <div className="widget w-full max-w-lg"><h3 className="widget-title">Decline Withdrawal</h3><div className="form-group"><label>Reason for declining:</label><textarea value={reason} onChange={e => setReason(e.target.value)} className="form-input !h-28" required /></div><div className="modal-actions"><button onClick={onClose} className="btn btn-secondary">Cancel</button><button onClick={handleSubmit} className="btn btn-danger" disabled={!reason.trim()}>Confirm Decline</button></div></div>
        </div>
    );
};

const SystemControls = ({ token, showMessage }) => {
    const [status, setStatus] = useState([]);
    const [isLoading, setIsLoading] = useState(true);

    const fetchStatus = useCallback(async () => {
        setIsLoading(true);
        try {
            const data = await api.getSystemStatus(token);
            setStatus(data);
        } catch (error) {
            showMessage(error.message, 'error');
        } finally {
            setIsLoading(false);
        }
    }, [token, showMessage]);

    useEffect(() => {
        fetchStatus();
    }, [fetchStatus]);

    const handleUpdate = async (feature) => {
        try {
            await api.updateSystemStatus(feature, token);
            showMessage(`${feature.feature_name} status updated.`, 'success');
            fetchStatus();
        } catch (error) {
            showMessage(error.message, 'error');
        }
    };

    const handleToggle = (feature_name) => {
        const feature = status.find(s => s.feature_name === feature_name);
        if (feature) {
            handleUpdate({ ...feature, is_enabled: !feature.is_enabled });
        }
    };

    const handleMessageChange = (feature_name, new_message) => {
        setStatus(prevStatus => prevStatus.map(s => s.feature_name === feature_name ? { ...s, disabled_message: new_message } : s));
    };

    const handleMessageSave = (feature_name) => {
        const feature = status.find(s => s.feature_name === feature_name);
        if (feature) {
            handleUpdate(feature);
        }
    };

    if (isLoading) {
        return <div className="widget text-center p-8">Loading System Controls...</div>;
    }

    return (
        <div className="widget mt-8">
            <h2 className="widget-title">Master System Controls</h2>
            <div className="space-y-6">
                {status.map(feature => (
                    <div key={feature.feature_name} className="p-4 bg-gray-900/50 rounded-lg border border-gray-700">
                        <div className="flex justify-between items-center">
                            <div>
                                <h4 className="font-bold text-lg text-white">{feature.feature_name.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</h4>
                                <p className={`text-sm font-semibold ${feature.is_enabled ? 'text-green-400' : 'text-red-400'}`}>
                                    {feature.is_enabled ? 'ENABLED' : 'DISABLED'}
                                </p>
                            </div>
                            <button onClick={() => handleToggle(feature.feature_name)} className={`px-4 py-2 rounded-md font-bold text-white ${feature.is_enabled ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'}`}>
                                {feature.is_enabled ? 'Disable' : 'Enable'}
                            </button>
                        </div>
                        {!feature.is_enabled && (
                            <div className="mt-4 flex items-end gap-2">
                                <div className="flex-grow">
                                    <label className="text-xs text-gray-400">Disabled Message</label>
                                    <input type="text" value={feature.disabled_message || ''} onChange={(e) => handleMessageChange(feature.feature_name, e.target.value)} className="form-input"/>
                                </div>
                                <button onClick={() => handleMessageSave(feature.feature_name)} className="btn btn-secondary !mt-0">Save Message</button>
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
};


// --- Main Admin Dashboard Component ---
const AdminDashboard = () => {
    const { user, token } = useAuth();
    const navigate = useNavigate();
    
    const [users, setUsers] = useState([]);
    const [servers, setServers] = useState([]);
    const [disputes, setDisputes] = useState([]);
    const [payoutRequests, setPayoutRequests] = useState([]);
    const [stats, setStats] = useState({ totalUsers: 0, gemsInCirculation: 0, pendingPayouts: 0, pendingDisputes: 0, taxCollected: 0 });
    const [transcript, setTranscript] = useState([]);
    const [tournaments, setTournaments] = useState([]);
    
    const [searchQuery, setSearchQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [selectedUser, setSelectedUser] = useState(null);
    const [selectedDispute, setSelectedDispute] = useState(null);
    const [selectedPayoutRequest, setSelectedPayoutRequest] = useState(null);
    const [payoutRequestDetails, setPayoutRequestDetails] = useState(null);
    const [isTranscriptModalOpen, setIsTranscriptModalOpen] = useState(false);
    const [isPayoutDetailModalOpen, setIsPayoutDetailModalOpen] = useState(false);
    const [isDeclineModalOpen, setIsDeclineModalOpen] = useState(false);
    const [message, setMessage] = useState({ text: '', type: '' });

    const showMessage = (text, type = 'success') => { setMessage({ text, type }); setTimeout(() => setMessage({ text: '', type: '' }), 5000); };
    
    const fetchData = useCallback(async () => {
        if (!token) return;
        setIsLoading(true);
        try {
            const [usersData, serversData, disputesData, payoutsData, statsData, tournamentsData] = await Promise.all([
                api.getAdminUsers(searchQuery, token, statusFilter),
                api.getAdminServers(token),
                api.getPendingDisputes(token),
                api.getAdminPayoutRequests(token),
                api.getAdminStats(token),
                api.getAdminTournaments(token)
            ]);
            setUsers(usersData);
            setServers(serversData);
            setDisputes(disputesData);
            setPayoutRequests(payoutsData);
            setStats(statsData);
            setTournaments(tournamentsData);
        } catch (error) { showMessage(error.message, 'error'); } finally { setIsLoading(false); }
    }, [token, searchQuery, statusFilter]);

    useEffect(() => { fetchData(); }, [fetchData]);

    const handleSearch = (e) => { e.preventDefault(); fetchData(); };
    const handleActionComplete = (msg, type) => { showMessage(msg, type); setSelectedUser(null); fetchData(); };
    const handleResolveDispute = async (id, type) => { try { const r = await api.resolveDispute(id, type, token); showMessage(r.message, 'success'); setSelectedDispute(null); fetchData(); } catch (e) { showMessage(e.message, 'error'); } };
    const handleViewTranscript = async (id) => { setTranscript([]); setIsTranscriptModalOpen(true); try { const d = await api.getTranscript(id, token); setTranscript(d); } catch (e) { showMessage(e.message, 'error'); } };
    const handleReviewPayout = async (request) => { try { const d = await api.getAdminUserDetailsForPayout(request.user_id, request.id, token); setPayoutRequestDetails({ request, ...d }); setIsPayoutDetailModalOpen(true); } catch (e) { showMessage(e.message, 'error'); } };
    const handleApprovePayout = async (id) => { try { const r = await api.approvePayoutRequest(id, token); showMessage(r.message, 'success'); setIsPayoutDetailModalOpen(false); fetchData(); } catch (e) { showMessage(e.message, 'error'); } };
    const handleDeclinePayoutClick = (request) => { setSelectedPayoutRequest(request); setIsPayoutDetailModalOpen(false); setIsDeclineModalOpen(true); };
    const handleConfirmDecline = async (reason) => { try { const r = await api.declinePayoutRequest(selectedPayoutRequest.id, reason, token); showMessage(r.message, 'success'); setIsDeclineModalOpen(false); setSelectedPayoutRequest(null); fetchData(); } catch (e) { showMessage(e.message, 'error'); } };
    const handleForwardToDiscord = async (disputeId) => { try { const r = await api.forwardDisputeToDiscord(disputeId, token); showMessage(r.message, 'success'); setSelectedDispute(null); fetchData(); } catch(e) { showMessage(e.message, 'error'); } };

    const isMasterAdmin = user?.email === 'scriptmail00@gmail.com';

    return (
        <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
            {message.text && <div className={`fixed top-5 right-5 p-4 rounded-lg text-white font-bold shadow-lg z-50 ${message.type === 'success' ? 'bg-green-500' : 'bg-red-500'}`}>{message.text}</div>}
            <header className="flex justify-between items-center mb-8"><h1 className="text-4xl font-bold text-white">Admin Dashboard</h1><button onClick={() => navigate('/dashboard')} className="btn btn-secondary !mt-0">Back to Dashboard</button></header>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6 mb-8">
                <StatCard title="Total Users" value={stats.totalUsers} icon="👥" /><StatCard title="Gems in Circulation" value={stats.gemsInCirculation.toLocaleString()} icon="💎" /><StatCard title="Pending Disputes" value={stats.pendingDisputes} icon="⚖️" /><StatCard title="Pending Payouts" value={stats.pendingPayouts} icon="💸" /><StatCard title="Total Tax Collected" value={stats.taxCollected.toLocaleString()} icon="📈" />
            </div>
            
            <div className="widget mb-8">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="widget-title !mb-0">Tournament Management</h2>
                    <button onClick={() => navigate('/admin/tournaments/create')} className="btn btn-primary !mt-0">Create Tournament</button>
                </div>
                <div className="overflow-x-auto">
                     <table className="w-full">
                        <thead><tr className="text-left text-xs text-gray-400 uppercase border-b border-gray-700"><th className="p-3">Name</th><th className="p-3">Status</th><th className="p-3">Starts At</th><th className="p-3"></th></tr></thead>
                        <tbody>
                            {isLoading ? (<tr><td colSpan="4" className="p-8 text-center">Loading...</td></tr>)
                            : tournaments.length > 0 ? (tournaments.map(t => (
                                <tr key={t.id} className="border-b border-gray-700 hover:bg-gray-800/50">
                                    <td className="p-3 font-semibold text-white">{t.name}</td>
                                    <td className="p-3">{t.status.replace('_', ' ').toUpperCase()}</td>
                                    <td className="p-3">{new Date(t.starts_at).toLocaleString()}</td>
                                    <td className="p-3 text-right"></td>
                                </tr>
                            ))) : (<tr><td colSpan="4" className="p-8 text-center text-gray-500">No tournaments created yet.</td></tr>)}
                        </tbody>
                    </table>
                </div>
            </div>

             <div className="widget mb-8">
                <h2 className="widget-title">Pending Withdrawal Requests</h2>
                <div className="overflow-x-auto">
                    <table className="w-full">
                         <thead><tr className="text-left text-xs text-gray-400 uppercase border-b border-gray-700"><th className="p-3">User</th><th className="p-3">Amount</th><th className="p-3">Type</th><th className="p-3">Requested At</th><th className="p-3"></th></tr></thead>
                        <tbody>
                            {isLoading ? (<tr><td colSpan="5" className="p-8 text-center">Loading...</td></tr>)
                            : payoutRequests.length > 0 ? (payoutRequests.map(req => (
                                <tr key={req.id} className="border-b border-gray-700 hover:bg-gray-800/50">
                                    <td className="p-3"><div className="font-semibold text-white">{req.linked_roblox_username}</div><div className="text-xs text-gray-400">{req.email}</div></td>
                                    <td className="p-3 font-bold text-cyan-400">{req.amount_gems.toLocaleString()} Gems</td><td className="p-3 uppercase">{req.type}</td>
                                    <td className="p-3 text-gray-400">{new Date(req.created_at).toLocaleString()}</td>
                                    <td className="p-3 text-right"><button onClick={() => handleReviewPayout(req)} className="btn btn-primary !mt-0 !py-1 !px-3">Review</button></td>
                                </tr>
                            ))) : (<tr><td colSpan="5" className="p-8 text-center text-gray-500">No pending payout requests.</td></tr>)}
                        </tbody>
                    </table>
                </div>
            </div>

            <div className="widget mb-8">
                <h2 className="widget-title">Pending Disputes</h2>
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead><tr className="text-left text-xs text-gray-400 uppercase border-b border-gray-700"><th className="p-3">Duel ID</th><th className="p-3">Reporter</th><th className="p-3">Reported</th><th className="p-3">Reason</th><th className="p-3 text-center">Has Video?</th><th className="p-3"></th></tr></thead>
                        <tbody>
                            {isLoading ? (<tr><td colSpan="6" className="text-center p-8">Loading...</td></tr>) 
                            : disputes.length > 0 ? (disputes.map(d => (
                                <tr key={d.id} className="border-b border-gray-700 hover:bg-gray-800/50">
                                    <td className="p-3">#{d.duel_id}</td><td className="p-3 font-semibold text-green-400">{d.reporter_username}</td><td className="p-3 font-semibold text-red-400">{d.reported_username}</td>
                                    <td className="p-3 text-sm text-gray-300 max-w-xs truncate" title={d.reason}>{d.reason}</td><td className="p-3 text-center">{d.has_video_evidence ? '✔️' : '❌'}</td>
                                    <td className="p-3 text-right"><button onClick={() => setSelectedDispute(d)} className="btn btn-primary !mt-0 !py-1 !px-3">Review</button></td>
                                </tr>
                            ))) : (<tr><td colSpan="6" className="text-center p-8 text-gray-500">No pending disputes.</td></tr>)}
                        </tbody>
                    </table>
                </div>
            </div>
            
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
                <div className="widget xl:col-span-2">
                    <div className="flex justify-between items-center mb-4">
                        <h2 className="widget-title !mb-0">User Management</h2>
                        <form onSubmit={handleSearch} className="flex gap-2">
                            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="form-input !w-32">
                                <option value="">All Statuses</option>
                                <option value="active">Active</option>
                                <option value="banned">Banned</option>
                                <option value="terminated">Terminated</option>
                            </select>
                            <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search by email or username..." className="form-input !w-60" />
                            <button type="submit" className="btn btn-primary !mt-0">Search</button>
                        </form>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead><tr className="text-left text-xs text-gray-400 uppercase border-b border-gray-700"><th className="p-3">User</th><th className="p-3 text-center">Gems</th><th className="p-3 text-center">W / L</th><th className="p-3 text-center">Status</th><th className="p-3"></th></tr></thead>
                            <tbody>{isLoading ? (<tr><td colSpan="5" className="text-center p-8">Loading...</td></tr>) : (users.map(user => <UserRow key={user.id} user={user} onSelectUser={setSelectedUser} />))}</tbody>
                        </table>
                    </div>
                </div>
                <div className="widget">
                    <h2 className="widget-title">Live Game Servers</h2>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="text-left text-xs text-gray-400 uppercase">
                                    <th className="p-2">Server ID</th>
                                    <th className="p-2 text-center">Players</th>
                                    <th className="p-2 text-center">Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {servers.length > 0 ? servers.map(server => {
                                    const lastBeat = new Date(server.last_heartbeat);
                                    const isOnline = (new Date() - lastBeat) < 60000; // 60 seconds threshold
                                    return (
                                        <tr key={server.server_id} className="border-t border-gray-800">
                                            <td className="p-2 font-mono font-semibold">{server.server_id}</td>
                                            <td className="p-2 text-center">{server.player_count}</td>
                                            <td className="p-2 text-center">
                                                <span className={`px-2 py-1 text-xs font-semibold rounded-full ${isOnline ? 'bg-green-800 text-green-200' : 'bg-red-800 text-red-200'}`}>
                                                    {isOnline ? 'ONLINE' : 'OFFLINE'}
                                                </span>
                                            </td>
                                        </tr>
                                    );
                                }) : (
                                    <tr><td colSpan="3" className="p-8 text-center text-gray-500">No active servers.</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {isMasterAdmin && <SystemControls token={token} showMessage={showMessage} />}

            <UserActionsModal isOpen={!!selectedUser} onClose={() => setSelectedUser(null)} user={selectedUser} token={token} onActionComplete={handleActionComplete}/>
            <DisputeResolutionModal isOpen={!!selectedDispute} onClose={() => setSelectedDispute(null)} dispute={selectedDispute} onResolve={handleResolveDispute} onViewTranscript={handleViewTranscript} onForwardToDiscord={handleForwardToDiscord} />
            <TranscriptModal isOpen={isTranscriptModalOpen} onClose={() => setIsTranscriptModalOpen(false)} transcript={transcript} />
            <AdminPayoutDetailModal isOpen={isPayoutDetailModalOpen} onClose={() => setIsPayoutDetailModalOpen(false)} requestDetails={payoutRequestDetails} onApprove={handleApprovePayout} onDecline={handleDeclinePayoutClick} />
            <DeclineModal isOpen={isDeclineModalOpen} onClose={() => setIsDeclineModalOpen(false)} onSubmit={handleConfirmDecline} />
        </div>
    );
};

export default AdminDashboard;
