import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import * as api from '../services/api';
import { ConfirmationModal } from '../components/Dashboard/Modals';

const Loader = () => (
    <div className="flex items-center justify-center p-12">
        <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
    </div>
);

const StatCard = ({ title, value, icon, color = 'text-white' }) => (
    <div className="widget flex items-center p-4 gap-4">
        <div className="text-3xl">{icon}</div>
        <div>
            <div className={`text-2xl font-bold ${color}`}>{value}</div>
            <div className="text-sm text-gray-400">{title}</div>
        </div>
    </div>
);

const CoHostStats = ({ cohostData }) => {
    const TIER_UPTIME_MILESTONES = {
        2: 40 * 3600,
        1: 120 * 3600,
    };
    const TIER_INFO = {
        1: { name: 'Tier 1', share: '50%', nextTierHours: null, color: 'text-green-400' },
        2: { name: 'Tier 2', share: '33.3%', nextTierHours: TIER_UPTIME_MILESTONES[1], color: 'text-yellow-400' },
        3: { name: 'Tier 3', share: '25%', nextTierHours: TIER_UPTIME_MILESTONES[2], color: 'text-cyan-400' },
    };

    const currentTierInfo = TIER_INFO[cohostData.reliability_tier] || TIER_INFO[3];
    const nextTierInfo = TIER_INFO[cohostData.reliability_tier - 1];

    const currentUptimeHours = cohostData.total_uptime_seconds / 3600;
    const hoursNeededForNextTier = (currentTierInfo.nextTierHours || 0) / 3600;
    
    const progressPercentage = nextTierInfo ? Math.min(100, (currentUptimeHours / hoursNeededForNextTier) * 100) : 100;

    return (
        <div className="widget mb-8">
            <h2 className="widget-title">Your Co-Host Status</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 p-4">
                <div className="text-center">
                    <p className="text-sm text-gray-400">Reliability Tier</p>
                    <p className={`text-3xl font-bold ${currentTierInfo.color}`}>{currentTierInfo.name}</p>
                </div>
                <div className="text-center">
                    <p className="text-sm text-gray-400">Current Gem Share</p>
                    <p className="text-3xl font-bold">{currentTierInfo.share}</p>
                </div>
                <div className="text-center">
                    <p className="text-sm text-gray-400">Total Uptime</p>
                    <p className="text-3xl font-bold">{currentUptimeHours.toFixed(1)} Hours</p>
                </div>
            </div>
            {nextTierInfo && (
                <div className="px-4 pb-4">
                    <div className="flex justify-between items-center mb-1 text-sm">
                        <span className="font-semibold">Progress to {nextTierInfo.name}</span>
                        <span>{currentUptimeHours.toFixed(1)} / {hoursNeededForNextTier.toFixed(0)} hrs</span>
                    </div>
                    <div className="w-full bg-gray-700 rounded-full h-2.5">
                        <div className="bg-blue-500 h-2.5 rounded-full" style={{ width: `${progressPercentage}%` }}></div>
                    </div>
                </div>
            )}
        </div>
    );
};


const CoHostingPage = () => {
    const { user, token, refreshUser } = useAuth();
    const navigate = useNavigate();

    const [status, setStatus] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [message, setMessage] = useState({ text: '', type: '' });
    const [isShutdownModalOpen, setIsShutdownModalOpen] = useState(false);
    const [loadstring, setLoadstring] = useState('');
    const [isTermsModalOpen, setIsTermsModalOpen] = useState(false);
    const [privateLinkInputs, setPrivateLinkInputs] = useState({});

    const showMessage = (text, type = 'success') => {
        setMessage({ text, type });
        setTimeout(() => setMessage({ text: '', type: '' }), 5000);
    };

    const fetchStatus = useCallback(async () => {
        if (!token) return;
        try {
            const data = await api.getCohostStatus(token);
            setStatus(data);
        } catch (error) {
            showMessage(error.message, 'error');
        } finally {
            setIsLoading(false);
        }
    }, [token]);

    useEffect(() => {
        fetchStatus();
        const interval = setInterval(fetchStatus, 15000);
        return () => clearInterval(interval);
    }, [fetchStatus]);

    const handleAgreeToTerms = async () => {
        setIsTermsModalOpen(false);
        try {
            await api.agreeToCohostTerms(token);
            showMessage("Terms agreed. You can now claim contracts.", "success");
            await refreshUser();
            await fetchStatus();
        } catch(error) {
            showMessage(error.message, 'error');
        }
    };
    
    const handleRequestScript = async (contractId) => {
        const privateServerLinkCode = privateLinkInputs[contractId];
        if (!privateServerLinkCode || privateServerLinkCode.trim() === '') {
            return showMessage("Please enter your private server link code.", "error");
        }
        setIsLoading(true);
        try {
            const response = await api.requestCohostScript(contractId, privateServerLinkCode, token);
            setLoadstring(response.script);
            showMessage(response.message, 'success');
        } catch (error) {
            showMessage(error.message, 'error');
        } finally {
            setIsLoading(false);
        }
    };

    const handleConfirmShutdown = async () => {
        setIsShutdownModalOpen(false);
        setIsLoading(true);
        try {
            const response = await api.shutdownCohostSession(token);
            showMessage(response.message, 'success');
            await fetchStatus();
        } catch (error) {
            showMessage(error.message, 'error');
        } finally {
            setIsLoading(false);
        }
    };
    
    const copyLoadstring = () => {
        navigator.clipboard.writeText(loadstring);
        showMessage('Loadstring copied to clipboard!', 'success');
    };

    const OnboardingView = () => (
        <div className="widget max-w-2xl mx-auto text-center">
            <h2 className="widget-title">Become a Co-Host</h2>
            <div className="p-4 space-y-4 text-gray-300">
                <p>Help decentralize the Blox Battles network by hosting a bot on your machine. In return, you'll earn a percentage of the gems collected from duels your bot referees.</p>
                {!user.discord_id ? (
                    <div className="p-4 bg-yellow-900/50 border border-yellow-700 rounded-lg">
                        <p className="font-bold text-yellow-300">Requirement: Link Your Discord Account</p>
                        <p className="text-sm mt-2">You must link your Discord account before you can start co-hosting. Use the <code className="bg-gray-700 p-1 rounded-md">/link</code> command in our server.</p>
                    </div>
                ) : (
                    <button onClick={() => setIsTermsModalOpen(true)} className="btn btn-primary" disabled={isLoading}>
                        View & Agree to Terms
                    </button>
                )}
            </div>
        </div>
    );
    
    const AvailableContracts = () => {
        const banExpires = status.cohostData?.cohost_ban_until ? new Date(status.cohostData.cohost_ban_until) : null;
        const isBanned = banExpires && banExpires > new Date();

        return (
            <>
                {status.cohostData && <CoHostStats cohostData={status.cohostData} />}
                {isBanned ? (
                    <div className="widget text-center bg-red-900/30 border border-red-700">
                        <h2 className="widget-title text-red-300">Co-Hosting Suspended</h2>
                        <p className="text-gray-300">Your co-hosting privileges are suspended due to an improper shutdown.</p>
                        <p className="text-white font-bold mt-2">Access will be restored on: {banExpires.toLocaleString()}</p>
                    </div>
                ) : (
                    <div className="widget">
                        <h2 className="widget-title">Available Contracts</h2>
                        {status.availableContracts.length > 0 ? (
                            <div className="space-y-4">
                                {status.availableContracts.map(c => (
                                    <div key={c.id} className="p-4 bg-gray-900/50 rounded-lg flex flex-col sm:flex-row items-center justify-between gap-4">
                                        <div>
                                            <p className="font-bold text-lg">Bot Contract for <span className="text-cyan-400">{c.region}</span></p>
                                            <p className="text-xs text-gray-400">Issued: {new Date(c.issued_at).toLocaleString()}</p>
                                        </div>
                                        <div className="w-full sm:w-auto flex-grow flex items-end gap-2">
                                            <div className="flex-grow">
                                                <label className="text-xs text-gray-400">Your Private Server Link Code</label>
                                                <input type="text" onChange={(e) => setPrivateLinkInputs(prev => ({...prev, [c.id]: e.target.value}))} value={privateLinkInputs[c.id] || ''} placeholder="Paste the code from your server link..." className="form-input !text-sm"/>
                                                <p className="text-xs text-gray-500 mt-1">On Roblox, go to Servers → Your Server → Configure → Generate Link. Copy the long code part.</p>
                                            </div>
                                            <button onClick={() => handleRequestScript(c.id)} className="btn btn-primary !mt-0 !h-[38px]">Get Script</button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className="text-center text-gray-500 p-4">No available contracts at this time. Check back later!</p>
                        )}
                    </div>
                )}
            </>
        );
    };

    const ScriptDisplayView = () => (
        <div className="widget text-center">
            <h2 className="widget-title">Your Unique Bot Script</h2>
            <p className="text-gray-300 mb-2">Your unique, one-time use script has been generated. Execute this in your Roblox client to claim the hosting contract.</p>
            <p className="text-yellow-400 font-bold text-sm mb-4">Do not share this script. The first person to run their script successfully will claim the contract.</p>
            <div className="p-4 bg-gray-900 rounded-lg font-mono text-left text-sm text-yellow-300 overflow-x-auto my-4">
                {loadstring}
            </div>
            <div className="flex justify-center items-center gap-4">
                <button onClick={() => setLoadstring('')} className="btn btn-secondary">Back to Contracts</button>
                <button onClick={copyLoadstring} className="btn btn-primary">Copy Script</button>
            </div>
        </div>
    );

    const DashboardView = () => {
        const { activeContract } = status;
        const tier = status.cohostData?.reliability_tier || 3;
        const tierInfo = {
            1: { name: 'Tier 1', share: '50%', color: 'text-green-400' },
            2: { name: 'Tier 2', share: '33.3%', color: 'text-yellow-400' },
            3: { name: 'Tier 3', share: '25%', color: 'text-cyan-400' },
        };
        const currentTierInfo = tierInfo[tier] || tierInfo[3];

        return (
            <div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                    <StatCard title="Session Status" value={activeContract.status.replace('_', ' ').toUpperCase()} icon={activeContract.status === 'active' ? '🟢' : '🟡'} />
                    <StatCard title="Reliability Tier" value={currentTierInfo.name} icon="🏆" color={currentTierInfo.color} />
                    <StatCard title="Gem Share" value={currentTierInfo.share} icon="💰" />
                    <StatCard title="Gems Earned This Session" value={activeContract.gems_earned.toLocaleString()} icon="💎" color="text-cyan-400" />
                </div>
                <div className="text-center">
                    <button onClick={() => setIsShutdownModalOpen(true)} className="btn bg-red-600 hover:bg-red-700" disabled={isLoading || activeContract.status !== 'active'}>
                        {isLoading ? 'Processing...' : (activeContract.status === 'winding_down' ? 'Shutdown Initiated' : 'Close Bot')}
                    </button>
                </div>
            </div>
        );
    };

    const renderContent = () => {
        if (isLoading && !status) return <Loader />;
        if (loadstring) return <ScriptDisplayView />;
        if (status?.activeContract) return <DashboardView />;
        if (status?.termsAgreed) return <AvailableContracts />;
        return <OnboardingView />;
    };

    return (
        <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
            {message.text && <div className={`fixed top-5 right-5 p-4 rounded-lg text-white font-bold shadow-lg z-50 ${message.type === 'success' ? 'bg-green-500' : 'bg-red-500'}`}>{message.text}</div>}
            <header className="flex justify-between items-center mb-8">
                <h1 className="text-4xl font-bold text-white">Co-Hosting</h1>
                <button onClick={() => navigate('/dashboard')} className="btn btn-secondary !mt-0">Back to Main Dashboard</button>
            </header>
            
            {renderContent()}

            <ConfirmationModal
                isOpen={isTermsModalOpen}
                onClose={() => setIsTermsModalOpen(false)}
                onConfirm={handleAgreeToTerms}
                title="Co-Hosting Terms of Service"
                confirmText="I Agree"
            >
                <p className="text-gray-300">By becoming a co-host, you agree to run the bot software as provided and not to tamper with its operation. Improper shutdowns will result in penalties. Do you agree to these terms?</p>
            </ConfirmationModal>

            <ConfirmationModal
                isOpen={isShutdownModalOpen}
                onClose={() => setIsShutdownModalOpen(false)}
                onConfirm={handleConfirmShutdown}
                title="Initiate Graceful Shutdown?"
                confirmText="Continue"
            >
                <p className="text-yellow-300">Warning: This will signal your bot to finish its current tasks and shut down. Do not close the Roblox client manually.</p>
                <p className="text-red-400 mt-2">Closing the client early will result in a 50% gem fine and a tier demotion.</p>
            </ConfirmationModal>
        </div>
    );
};

export default CoHostingPage;
