import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import * as api from '../services/api';

const AdminSystemControlsPage = () => {
    const { token } = useAuth();
    const navigate = useNavigate();
    const [status, setStatus] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [message, setMessage] = useState({ text: '', type: '' });

    const showMessage = (text, type = 'success') => {
        setMessage({ text, type });
        setTimeout(() => setMessage({ text: '', type: '' }), 5000);
    };

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
    }, [token]);

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

    return (
        <div className="max-w-4xl mx-auto p-4 sm:p-6 lg:p-8">
            {message.text && <div className={`fixed top-5 right-5 p-4 rounded-lg text-white font-bold shadow-lg z-50 ${message.type === 'success' ? 'bg-green-500' : 'bg-red-500'}`}>{message.text}</div>}
            
            <header className="flex justify-between items-center mb-8">
                <h1 className="text-4xl font-bold text-white">Master System Controls</h1>
                <button onClick={() => navigate('/admin')} className="btn btn-secondary !mt-0">Back to Admin</button>
            </header>

            <div className="widget">
                <h2 className="widget-title">Feature Flags & System Status</h2>
                {isLoading ? (
                     <div className="text-center p-8">Loading System Controls...</div>
                ) : (
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
                )}
            </div>
        </div>
    );
};

export default AdminSystemControlsPage;
