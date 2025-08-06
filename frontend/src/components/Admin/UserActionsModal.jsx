import React, { useState } from 'react';
import * as api from '../../services/api';

const Modal = ({ children, isOpen, onClose, title }) => {
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 p-4">
            <div className="widget w-full max-w-lg max-h-[90vh] flex flex-col relative">
                <header className="p-4 border-b border-gray-700 flex justify-between items-center flex-shrink-0">
                    <h2 className="text-xl font-bold text-gray-100">{title}</h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">&times;</button>
                </header>
                <div className="p-6 overflow-y-auto space-y-6">{children}</div>
            </div>
        </div>
    );
};

const UserActionsModal = ({ user, isOpen, onClose, onActionComplete, token }) => {
    const [gemAmount, setGemAmount] = useState(0);
    const [banReason, setBanReason] = useState('');
    const [banDuration, setBanDuration] = useState(24); // Default to 24 hours

    if (!user) return null;

    const handleGemUpdate = async (e) => {
        e.preventDefault();
        try {
            await api.updateUserGems(user.id, parseInt(gemAmount, 10), token);
            onActionComplete(`Gems updated for ${user.email}.`);
        } catch (error) {
            onActionComplete(error.message, 'error');
        }
    };

    const handleBan = async (e) => {
        e.preventDefault();
        try {
            await api.banUser(user.id, banReason, banDuration, token);
            onActionComplete(`${user.email} has been banned.`, 'success');
        } catch (error) {
            onActionComplete(error.message, 'error');
        }
    };

    const handleUnban = async () => {
        try {
            await api.unbanUser(user.id, token);
            onActionComplete(`${user.email} has been unbanned.`, 'success');
        } catch (error) {
            onActionComplete(error.message, 'error');
        }
    };

    const handleDelete = async () => {
        if (window.confirm(`Are you sure you want to permanently terminate ${user.email}? Their gems will be voided and this cannot be undone.`)) {
            try {
                // Note: The API call is 'deleteUserAccount' but the backend logic performs a non-destructive "terminate".
                await api.deleteUserAccount(user.id, token);
                onActionComplete(`${user.email} has been terminated.`, 'success');
            } catch (error) {
                onActionComplete(error.message, 'error');
            }
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`Manage User: ${user.linked_roblox_username || user.email}`}>
            {/* Gem Management */}
            <div className="p-4 rounded-lg bg-gray-900/50 border border-gray-700">
                <h4 className="font-bold text-lg mb-2 text-white">Modify Gems</h4>
                <form onSubmit={handleGemUpdate} className="flex items-end gap-3">
                    <div className="flex-grow">
                        <label className="text-sm text-gray-400">Add or Remove Gems</label>
                        <input type="number" value={gemAmount} onChange={e => setGemAmount(e.target.value)} className="form-input" placeholder="e.g., 100 or -50" />
                    </div>
                    <button type="submit" className="btn btn-primary !mt-0">Update Gems</button>
                </form>
            </div>

            {/* Ban Management */}
            {/* [MODIFIED] This section now uses the user.status field for conditional rendering. */}
            <div className="p-4 rounded-lg bg-gray-900/50 border border-gray-700">
                <h4 className="font-bold text-lg mb-2 text-white">Ban Management</h4>
                {user.status === 'banned' ? (
                    <div className="flex justify-between items-center">
                        <div>
                            <p className="text-red-400">This user is currently banned.</p>
                            <small className="text-gray-400">Reason: {user.ban_reason}</small>
                        </div>
                        <button onClick={handleUnban} className="btn btn-primary !mt-0">Unban</button>
                    </div>
                ) : (
                    <form onSubmit={handleBan} className="space-y-3">
                        <div>
                            <label className="text-sm text-gray-400">Reason for Ban</label>
                            <input type="text" value={banReason} onChange={e => setBanReason(e.target.value)} required className="form-input" />
                        </div>
                        <div>
                            <label className="text-sm text-gray-400">Duration (in hours, leave empty for permanent)</label>
                            <input type="number" value={banDuration} onChange={e => setBanDuration(e.target.value)} className="form-input" placeholder="e.g., 24" />
                        </div>
                        <button type="submit" className="btn bg-yellow-600 text-white !mt-0 w-full">Apply Ban</button>
                    </form>
                )}
            </div>

            {/* Account Termination */}
            <div className="p-4 rounded-lg bg-red-900/30 border border-red-700">
                 <div className="flex justify-between items-center">
                    <div>
                        <h4 className="font-bold text-lg text-red-300">Terminate Account</h4>
                        <p className="text-sm text-red-400">This action is permanent and cannot be undone.</p>
                    </div>
                    <button onClick={handleDelete} className="btn bg-red-600 text-white !mt-0">Terminate User</button>
                </div>
            </div>
        </Modal>
    );
};

export default UserActionsModal;