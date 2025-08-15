// START OF FILE frontend/pages/SettingsPage.jsx ---
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import * as api from '../services/api';
import { ConfirmationModal } from '../components/Dashboard/Modals';
import CreateTicketModal from '../components/Dashboard/CreateTicketModal';

const SettingsRow = ({ label, value }) => (
    <div className="flex justify-between items-center py-3 border-b border-gray-700">
        <span className="text-gray-400">{label}</span>
        <span className="font-semibold text-white">{value}</span>
    </div>
);

const ToggleSwitch = ({ enabled, onToggle, disabled = false }) => (
    <button
        onClick={onToggle}
        disabled={disabled}
        className={`relative inline-flex items-center h-6 rounded-full w-11 transition-colors duration-300 focus:outline-none ${
            enabled ? 'bg-green-500' : 'bg-gray-600'
        } ${disabled ? 'cursor-not-allowed opacity-50' : ''}`}
    >
        <span
            className={`inline-block w-4 h-4 transform bg-white rounded-full transition-transform duration-300 ${
                enabled ? 'translate-x-6' : 'translate-x-1'
            }`}
        />
    </button>
);

const SettingsCard = ({ title, children }) => (
    <div className="widget">
        <h3 className="widget-title">{title}</h3>
        <div className="p-1">{children}</div>
    </div>
);

const DangerZoneCard = ({ title, text, buttonText, onAction }) => (
    <div className="bg-red-900/20 border border-red-800 p-4 rounded-lg flex items-center justify-between">
        <div>
            <h4 className="font-bold text-red-300">{title}</h4>
            <p className="text-sm text-gray-400">{text}</p>
        </div>
        <button onClick={onAction} className="btn bg-[var(--loss-color)] text-white !mt-0">
            {buttonText}
        </button>
    </div>
);

const SettingsPage = () => {
    const { user, token, logout, refreshUser, appConfig } = useAuth();
    const navigate = useNavigate();
    
    const [message, setMessage] = useState({ text: '', type: '' });
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [deletePassword, setDeletePassword] = useState('');
    const [notificationsEnabled, setNotificationsEnabled] = useState(user?.discord_notifications_enabled ?? true);
    const [acceptingChallenges, setAcceptingChallenges] = useState(user?.accepting_challenges ?? true);
    const [isTicketModalOpen, setIsTicketModalOpen] = useState(false);
    const [isTicketSubmitting, setIsTicketSubmitting] = useState(false);

    const [isUnlinkModalOpen, setUnlinkModalOpen] = useState(false);
    const [isUnlinkDiscordModalOpen, setUnlinkDiscordModalOpen] = useState(false);
    const [isDeleteModalOpen, setDeleteModalOpen] = useState(false);

    useEffect(() => {
        setNotificationsEnabled(user?.discord_notifications_enabled ?? true);
        setAcceptingChallenges(user?.accepting_challenges ?? true);
    }, [user]);

    const showMessage = (text, type) => {
        setMessage({ text, type });
        setTimeout(() => setMessage({ text: '', type: '' }), 5000);
    };

    const handleUpdatePassword = async (e) => {
        e.preventDefault();
        if (newPassword !== confirmPassword) {
            return showMessage("New passwords do not match.", "error");
        }
        try {
            const result = await api.updatePassword({ currentPassword, newPassword }, token);
            showMessage(result.message, 'success');
            setCurrentPassword('');
            setNewPassword('');
            setConfirmPassword('');
            refreshUser();
        } catch (error) {
            showMessage(error.message, 'error');
        }
    };

    const handleNotificationToggle = async () => {
        const newPreference = !notificationsEnabled;
        setNotificationsEnabled(newPreference);
        try {
            await api.updateDiscordNotificationPreference(newPreference, token);
            showMessage('Discord notification preferences updated.', 'success');
            refreshUser();
        } catch (error) {
            showMessage(error.message, 'error');
            setNotificationsEnabled(!newPreference);
        }
    };
    
    const handleChallengeToggle = async () => {
        const newPreference = !acceptingChallenges;
        setAcceptingChallenges(newPreference);
        try {
            await api.updateChallengePreference(newPreference, token);
            showMessage('Challenge preference updated.', 'success');
            refreshUser();
        } catch (error) {
            showMessage(error.message, 'error');
            setAcceptingChallenges(!newPreference);
        }
    };

    const handleUnlinkRoblox = async () => {
        try {
            await api.unlinkRoblox(token);
            showMessage("Roblox account unlinked successfully.", 'success');
            setUnlinkModalOpen(false);
            window.location.href = '/link-account';
        } catch (error) {
            showMessage(error.message, 'error');
        }
    };

    const handleUnlinkDiscord = async () => {
        try {
            await api.unlinkDiscord(token);
            showMessage("Discord account unlinked successfully.", 'success');
            setUnlinkDiscordModalOpen(false);
            await refreshUser();
        } catch (error) {
            showMessage(error.message, 'error');
        }
    };
    
    const handleConfirmDelete = async () => {
        try {
            await api.deleteAccount(deletePassword, token);
            showMessage("Your account has been permanently deleted.", 'success');
            setDeleteModalOpen(false);
            setTimeout(logout, 2000);
        } catch (error) {
            showMessage(error.message, 'error');
        }
    };

    const handleTicketSubmit = async (ticketData) => {
        setIsTicketSubmitting(true);
        try {
            const result = await api.createSupportTicket(ticketData, token);
            showMessage(result.message, 'success');
            setIsTicketModalOpen(false);
        } catch (error) {
            showMessage(error.message, 'error');
        } finally {
            setIsTicketSubmitting(false);
        }
    };

    const formatDate = (dateString) => {
        if (!dateString) return "Never";
        return new Date(dateString).toLocaleDateString('en-US', {
            year: 'numeric', month: 'long', day: 'numeric'
        });
    };

    return (
        <div className="max-w-4xl mx-auto p-4 sm:p-6 lg:p-8">
            {message.text && <div className={`fixed top-5 right-5 p-4 rounded-lg text-white font-bold shadow-lg z-50 ${message.type === 'success' ? 'bg-green-500' : 'bg-red-500'}`}>{message.text}</div>}
            
            <header className="flex justify-between items-center mb-8">
                <h1 className="text-4xl font-bold text-white">Settings</h1>
                <button onClick={() => navigate('/dashboard')} className="btn btn-secondary !mt-0">Back to Dashboard</button>
            </header>

            <div className="space-y-8">
                <SettingsCard title="Account Information">
                    <SettingsRow label="Email Address" value={user.email} />
                    <SettingsRow label="User ID" value={user.id} />
                    <SettingsRow label="Linked Roblox Account" value={user.linked_roblox_username || 'Not Linked'} />
                    <SettingsRow label="Linked Discord Account" value={user.discord_username || 'Not Linked'} />
                    <SettingsRow label="Member Since" value={formatDate(user.created_at)} />
                    <div className="text-center pt-4 mt-2">
                        <button onClick={() => navigate('/history')} className="btn btn-primary">
                            Transaction History
                        </button>
                    </div>
                </SettingsCard>

                <SettingsCard title="Privacy Settings">
                    <div className="flex justify-between items-center py-3">
                        <div>
                            <span className="text-gray-300 font-semibold">Allow Incoming Challenges</span>
                            <p className="text-sm text-gray-500">Allow other players to send you duel challenges.</p>
                        </div>
                        <ToggleSwitch enabled={acceptingChallenges} onToggle={handleChallengeToggle} />
                    </div>
                </SettingsCard>
                
                <SettingsCard title="Support">
                    <div className="flex justify-between items-center py-3">
                        <div>
                            <span className="text-gray-300 font-semibold">Contact Support</span>
                            <p className="text-sm text-gray-500">Need help? Open a support ticket to speak with a staff member.</p>
                        </div>
                        <button onClick={() => setIsTicketModalOpen(true)} className="btn btn-primary !mt-0" disabled={!user.discord_id}>
                            {user.discord_id ? 'Create Ticket' : 'Link Discord to Create'}
                        </button>
                    </div>
                </SettingsCard>

                <SettingsCard title="Notifications">
                    {user.discord_id ? (
                        <div className="flex justify-between items-center py-3">
                            <div>
                                <span className="text-gray-300 font-semibold">Discord DM Notifications</span>
                                <p className="text-sm text-gray-500">Receive DMs for challenges, duel status, and more.</p>
                            </div>
                            <ToggleSwitch enabled={notificationsEnabled} onToggle={handleNotificationToggle} />
                        </div>
                    ) : (
                        <div className="text-center p-4">
                            <p className="text-gray-400 mb-4">Link your Discord account to get notifications when it's time to duel.</p>
                             <a href={appConfig?.discordInviteUrl || '#'}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="btn btn-primary inline-flex items-center gap-2"
                            >
                                Link on Discord
                            </a>
                            <p className="text-xs text-gray-500 mt-2">Use the <code className="bg-gray-700 p-1 rounded-md">/link</code> command in the server.</p>
                        </div>
                    )}
                </SettingsCard>

                {!user.google_id && (
                    <SettingsCard title="Security">
                         <SettingsRow label="Password Last Updated" value={formatDate(user.password_last_updated)} />
                        <form onSubmit={handleUpdatePassword} className="space-y-4 pt-4">
                            <div className="form-group"><label>Current Password</label><input type="password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} required className="form-input" /></div>
                            <div className="form-group"><label>New Password</label><input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} required className="form-input" /></div>
                            <div className="form-group"><label>Confirm New Password</label><input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required className="form-input" /></div>
                            <div className="text-right"><button type="submit" className="btn btn-primary">Update Password</button></div>
                        </form>
                    </SettingsCard>
                )}

                <SettingsCard title="Danger Zone">
                    <div className="space-y-4">
                        <div className="bg-gray-800/50 border border-gray-700 p-4 rounded-lg flex items-center justify-between">
                            <div>
                                <h4 className="font-bold text-gray-300">Log Out</h4>
                                <p className="text-sm text-gray-400">End your current session on this device.</p>
                            </div>
                            <button onClick={logout} className="btn btn-secondary !mt-0">
                                Log Out
                            </button>
                        </div>
                        <DangerZoneCard title="Unlink Roblox Account" text="This will remove the connection to your Roblox account." buttonText="Unlink" onAction={() => setUnlinkModalOpen(true)} />
                        {user.discord_id && (
                             <DangerZoneCard 
                                title="Unlink Discord Account" 
                                text={`Currently linked to ${user.discord_username}.`} 
                                buttonText="Unlink" 
                                onAction={() => setUnlinkDiscordModalOpen(true)} 
                            />
                        )}
                        <DangerZoneCard title="Delete Account" text="This action is permanent and cannot be undone." buttonText="Delete" onAction={() => setDeleteModalOpen(true)} />
                    </div>
                </SettingsCard>
            </div>

            <CreateTicketModal
                isOpen={isTicketModalOpen}
                onClose={() => setIsTicketModalOpen(false)}
                onSubmit={handleTicketSubmit}
                isSubmitting={isTicketSubmitting}
            />
            <ConfirmationModal 
                isOpen={isUnlinkModalOpen} 
                onClose={() => setUnlinkModalOpen(false)}
                onConfirm={handleUnlinkRoblox}
                title="Unlink Roblox Account?"
                text="Are you sure? You will need to re-verify your account to participate in duels."
                confirmText="Yes, Unlink"
            />
            <ConfirmationModal
                isOpen={isUnlinkDiscordModalOpen}
                onClose={() => setUnlinkDiscordModalOpen(false)}
                onConfirm={handleUnlinkDiscord}
                title="Unlink Discord Account?"
                text="Are you sure? You can re-link your account later using the /link command in Discord."
                confirmText="Yes, Unlink"
            />
            <ConfirmationModal 
                isOpen={isDeleteModalOpen} 
                onClose={() => setDeleteModalOpen(false)}
                onConfirm={handleConfirmDelete}
                title="Delete Your Account?"
                text="This is permanent and cannot be undone. All duel history and gems will be lost."
                confirmText="Yes, Delete My Account"
            >
                {!user.google_id && (
                    <div className="mt-4">
                        <label className="block text-sm font-medium text-gray-300 mb-1">Enter password to confirm</label>
                        <input type="password" value={deletePassword} onChange={(e) => setDeletePassword(e.target.value)} className="form-input" placeholder="••••••••" required />
                    </div>
                )}
            </ConfirmationModal>
        </div>
    );
};

export default SettingsPage;
