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
        const interval = setInterval(fetchStatus, 15000); // Poll for updates
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
        const privateServerLink = privateLinkInputs[contractId];
        if (!privateServerLink || !privateServerLink.startsWith("https://www.roblox.com/games/")) {
            return showMessage("Please enter a valid Roblox private server link.", "error");
        }
        setIsLoading(true);
        try {
            const response = await api.requestCohostScript(contractId, privateServerLink, token);
            const scriptContent = `loadstring(game:HttpGet("https://your-raw-script-url.com/v5-cohost.txt"))("${response.tempAuthToken}", "${contractId}", "${privateServerLink}")`;
            setLoadstring(scriptContent);
            showMessage('Script generated! The first person to run their script wins the contract.', 'success');
            await fetchStatus();
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
    
    const AvailableContracts = () => (
        <div className="widget mb-8">
            <h2 className="widget-title">Available Contracts</h2>
            {status.availableContracts.length > 0 ? (
                <div className="space-y-4">
                    {status.availableContracts.map(c => (
                        <div key={c.id} className="p-4 bg-gray-900/50 rounded-lg flex items-center justify-between">
                            <div>
                                <p className="font-bold text-lg">Bot Contract for <span className="text-cyan-400">{c.region}</span></p>
                                <p className="text-xs text-gray-400">Issued: {new Date(c.issued_at).toLocaleString()}</p>
                            </div>
                            <div className="flex items-end gap-2">
                                <div className="w-72">
                                    <label className="text-xs text-gray-400">Your Private Server Link</label>
                                    <input type="text" onChange={(e) => setPrivateLinkInputs(prev => ({...prev, [c.id]: e.target.value}))} value={privateLinkInputs[c.id] || ''} placeholder="https://www.roblox.com/games/..." className="form-input !text-sm"/>
                                </div>
                                <button onClick={() => handleRequestScript(c.id)} className="btn btn-primary !mt-0">Get Script</button>
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <p className="text-center text-gray-500 p-4">No available contracts at this time. Check back later!</p>
            )}
        </div>
    );

    const DashboardView = () => {
        const { activeContract } = status;
        const tier = status.activeContract?.reliability_tier || 3;
        const tierInfo = {
            1: { share: '50%', color: 'text-green-400' },
            2: { share: '33.3%', color: 'text-yellow-400' },
            3: { share: '25%', color: 'text-cyan-400' },
        };

        return (
            <div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                    <StatCard title="Session Status" value={activeContract.status.replace('_', ' ').toUpperCase()} icon={activeContract.status === 'active' ? '🟢' : '🟡'} />
                    <StatCard title="Reliability Tier" value={`Tier ${tier}`} icon="🏆" color={tierInfo[tier]?.color} />
                    <StatCard title="Gem Share" value={`${tierInfo[tier]?.share}`} icon="💰" />
                    <StatCard title="Gems Earned This Session" value={activeContract.gems_earned.toLocaleString()} icon="💎" color="text-cyan-400" />
                </div>
                {loadstring ? (
                    <div className="widget text-center">
                        <h3 className="widget-title">Your Unique Bot Script</h3>
                        <p className="text-gray-400 mb-4">Execute this one-time script in your Roblox client. Do not share it.</p>
                        <div className="p-4 bg-gray-900 rounded-lg font-mono text-left text-sm text-yellow-300 overflow-x-auto">
                            {loadstring}
                        </div>
                        <button onClick={copyLoadstring} className="btn btn-secondary mt-4">Copy Script</button>
                    </div>
                ) : (
                     <div className="text-center">
                        <button onClick={() => setIsShutdownModalOpen(true)} className="btn bg-red-600 hover:bg-red-700" disabled={isLoading || activeContract.status !== 'active'}>
                            {isLoading ? 'Processing...' : (activeContract.status === 'winding_down' ? 'Shutdown Initiated' : 'Close Bot')}
                        </button>
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
            {message.text && <div className={`fixed top-5 right-5 p-4 rounded-lg text-white font-bold shadow-lg z-50 ${message.type === 'success' ? 'bg-green-500' : 'bg-red-500'}`}>{message.text}</div>}
            <header className="flex justify-between items-center mb-8">
                <h1 className="text-4xl font-bold text-white">Co-Hosting</h1>
                <button onClick={() => navigate('/dashboard')} className="btn btn-secondary !mt-0">Back to Main Dashboard</button>
            </header>
            
            {isLoading && !status ? <Loader /> : (
                <>
                    {!status?.activeContract && status?.termsAgreed && <AvailableContracts />}
                    {status?.activeContract ? <DashboardView /> : <OnboardingView />}
                </>
            )}

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
