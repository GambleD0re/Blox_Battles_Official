import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import * as api from '../services/api';

const Loader = () => (
    <div className="flex items-center justify-center p-8">
        <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
    </div>
);

const ContractRow = ({ contract }) => {
    const statusStyles = {
        available: 'bg-green-800 text-green-200',
        claimed: 'bg-yellow-800 text-yellow-200',
        active: 'bg-blue-800 text-blue-200',
        winding_down: 'bg-purple-800 text-purple-200',
        completed: 'bg-gray-700 text-gray-300',
        crashed: 'bg-red-800 text-red-200',
    };
    
    const formatUptime = (start, end) => {
        if (!start) return '00:00:00';
        const startTime = new Date(start);
        const endTime = end ? new Date(end) : new Date();
        let diff = Math.max(0, (endTime - startTime) / 1000);
        const hours = Math.floor(diff / 3600).toString().padStart(2, '0');
        diff %= 3600;
        const minutes = Math.floor(diff / 60).toString().padStart(2, '0');
        const seconds = Math.floor(diff % 60).toString().padStart(2, '0');
        return `${hours}:${minutes}:${seconds}`;
    };

    return (
        <tr className="border-b border-gray-800 hover:bg-gray-800/50">
            <td className="p-3 font-mono text-xs text-gray-400" title={contract.id}>{contract.id.substring(0, 8)}...</td>
            <td className="p-3"><span className={`px-2 py-1 text-xs font-semibold rounded-full ${statusStyles[contract.status]}`}>{contract.status.replace('_', ' ').toUpperCase()}</span></td>
            <td className="p-3 font-semibold">{contract.co_host_username || 'N/A'}</td>
            <td className="p-3">{contract.region}</td>
            <td className="p-3">{contract.start_time ? formatUptime(contract.start_time, contract.end_time) : 'N/A'}</td>
            <td className="p-3 text-cyan-400">{contract.gems_earned.toLocaleString()}</td>
            <td className="p-3 text-gray-400">{contract.admin_username}</td>
        </tr>
    );
};

const AdminHostManagerPage = () => {
    const { token } = useAuth();
    const navigate = useNavigate();
    const [contracts, setContracts] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [message, setMessage] = useState({ text: '', type: '' });
    const [selectedRegion, setSelectedRegion] = useState('NA-East');
    const [gameData, setGameData] = useState({ regions: [] });

    const showMessage = (text, type = 'success') => {
        setMessage({ text, type });
        setTimeout(() => setMessage({ text: '', type: '' }), 5000);
    };

    const fetchData = useCallback(async () => {
        if (!token) return;
        setIsLoading(true);
        try {
            const [contractsData, gData] = await Promise.all([
                api.getAdminHostContracts(token),
                api.getGameData(token)
            ]);
            setContracts(contractsData);
            setGameData(gData);
            if (gData.regions && gData.regions.length > 0) {
                setSelectedRegion(gData.regions[0].id);
            }
        } catch (error) {
            showMessage(error.message, 'error');
        } finally {
            setIsLoading(false);
        }
    }, [token]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const handleIssueContract = async () => {
        if (!selectedRegion) {
            showMessage("Please select a region.", "error");
            return;
        }
        try {
            const result = await api.issueHostContract(selectedRegion, token);
            showMessage(result.message, 'success');
            fetchData();
        } catch (error) {
            showMessage(error.message, 'error');
        }
    };
    
    return (
        <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
            {message.text && <div className={`fixed top-5 right-5 p-4 rounded-lg text-white font-bold shadow-lg z-50 ${message.type === 'success' ? 'bg-green-500' : 'bg-red-500'}`}>{message.text}</div>}
            <header className="flex justify-between items-center mb-8">
                <h1 className="text-4xl font-bold text-white">Host Manager</h1>
                <button onClick={() => navigate('/admin')} className="btn btn-secondary !mt-0">Back to Admin</button>
            </header>

            <div className="widget mb-8">
                <h2 className="widget-title">Issue New Bot Contract</h2>
                <div className="flex items-end gap-4 p-2">
                    <div className="flex-grow">
                        <label className="text-sm font-medium text-gray-400">Target Region</label>
                        <select value={selectedRegion} onChange={(e) => setSelectedRegion(e.target.value)} className="form-input">
                            {gameData.regions.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                        </select>
                    </div>
                    <button onClick={handleIssueContract} className="btn btn-primary !mt-0">Issue Contract</button>
                </div>
            </div>

            <div className="widget">
                <h2 className="widget-title">All Host Contracts</h2>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="text-left text-xs text-gray-400 uppercase border-b border-gray-700">
                                <th className="p-3">Contract ID</th>
                                <th className="p-3">Status</th>
                                <th className="p-3">Co-Host</th>
                                <th className="p-3">Region</th>
                                <th className="p-3">Uptime</th>
                                <th className="p-3">Gems Earned</th>
                                <th className="p-3">Issued By</th>
                            </tr>
                        </thead>
                        <tbody>
                            {isLoading ? (<tr><td colSpan="7"><Loader /></td></tr>)
                            : contracts.length > 0 ? (contracts.map(c => <ContractRow key={c.id} contract={c} />))
                            : (<tr><td colSpan="7" className="p-8 text-center text-gray-500">No contracts found.</td></tr>)}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default AdminHostManagerPage;
