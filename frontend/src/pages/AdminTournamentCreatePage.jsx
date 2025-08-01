import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import * as api from '../services/api';

const AdminTournamentCreatePage = () => {
    const { token } = useAuth();
    const navigate = useNavigate();
    const [gameData, setGameData] = useState({ maps: [], weapons: [], regions: [] });
    const [message, setMessage] = useState({ text: '', type: '' });
    const [isSubmitting, setIsSubmitting] = useState(false);

    const [tournament, setTournament] = useState({
        name: '',
        region: 'NA-East',
        assigned_bot_id: '',
        private_server_link: '',
        buy_in_amount: 100,
        prize_pool_gems: 5000,
        registration_opens_at: '',
        starts_at: '',
        prize_distribution: { '1': 2500, '2': 1500, '3': 1000 },
        rules: { map_pool: [], banned_weapons: [] },
    });

    useEffect(() => {
        api.getGameData(token).then(setGameData).catch(err => setMessage({ text: err.message, type: 'error' }));
    }, [token]);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setTournament(prev => ({ ...prev, [name]: value }));
    };
    
    const handleRulesChange = (type, id) => {
        setTournament(prev => {
            const currentItems = prev.rules[type];
            const newItems = currentItems.includes(id) ? currentItems.filter(item => item !== id) : [...currentItems, id];
            return { ...prev, rules: { ...prev.rules, [type]: newItems } };
        });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsSubmitting(true);
        setMessage({ text: '', type: '' });
        try {
            const dataToSubmit = {
                ...tournament,
                buy_in_amount: parseInt(tournament.buy_in_amount, 10),
                prize_pool_gems: parseInt(tournament.prize_pool_gems, 10),
            };
            const result = await api.createTournament(dataToSubmit, token);
            setMessage({ text: result.message, type: 'success' });
            setTimeout(() => navigate('/admin'), 2000);
        } catch (err) {
            setMessage({ text: err.message, type: 'error' });
            setIsSubmitting(false);
        }
    };

    return (
        <div className="max-w-4xl mx-auto p-4 sm:p-6 lg:p-8">
            {message.text && <div className={`mb-6 p-4 rounded-lg text-white font-bold shadow-lg ${message.type === 'success' ? 'bg-green-500' : 'bg-red-500'}`}>{message.text}</div>}
            <header className="flex justify-between items-center mb-8">
                <h1 className="text-4xl font-bold text-white">Create New Tournament</h1>
                <button onClick={() => navigate('/admin')} className="btn btn-secondary !mt-0">Back to Admin</button>
            </header>

            <form onSubmit={handleSubmit} className="widget space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="form-group"><label>Tournament Name</label><input type="text" name="name" value={tournament.name} onChange={handleChange} required className="form-input" /></div>
                    <div className="form-group"><label>Region (for display)</label><select name="region" value={tournament.region} onChange={handleChange} className="form-input">{gameData.regions.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</select></div>
                    <div className="form-group"><label>Assigned Bot ID</label><input type="text" name="assigned_bot_id" value={tournament.assigned_bot_id} onChange={handleChange} required placeholder="e.g., T1_NA-East" className="form-input" /></div>
                    <div className="form-group"><label>Private Server Link</label><input type="url" name="private_server_link" value={tournament.private_server_link} onChange={handleChange} required className="form-input" /></div>
                    <div className="form-group"><label>Buy-in (Gems)</label><input type="number" name="buy_in_amount" value={tournament.buy_in_amount} onChange={handleChange} required min="0" className="form-input" /></div>
                    <div className="form-group"><label>Total Prize Pool (Gems)</label><input type="number" name="prize_pool_gems" value={tournament.prize_pool_gems} onChange={handleChange} required min="0" className="form-input" /></div>
                    <div className="form-group"><label>Registration Opens At</label><input type="datetime-local" name="registration_opens_at" value={tournament.registration_opens_at} onChange={handleChange} required className="form-input" /></div>
                    <div className="form-group"><label>Tournament Starts At</label><input type="datetime-local" name="starts_at" value={tournament.starts_at} onChange={handleChange} required className="form-input" /></div>
                </div>

                <div className="form-group">
                    <label>Map Pool</label>
                    <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 p-2 bg-gray-900/50 rounded-lg max-h-48 overflow-y-auto">
                        {gameData.maps.map(map => (
                            <label key={map.id} className={`p-2 text-sm text-center rounded-md cursor-pointer transition-colors ${tournament.rules.map_pool.includes(map.id) ? 'bg-blue-600 text-white' : 'bg-gray-700 hover:bg-gray-600'}`}>
                                <input type="checkbox" checked={tournament.rules.map_pool.includes(map.id)} onChange={() => handleRulesChange('map_pool', map.id)} className="hidden" />
                                {map.name}
                            </label>
                        ))}
                    </div>
                </div>

                <div className="text-right">
                    <button type="submit" className="btn btn-primary" disabled={isSubmitting}>{isSubmitting ? 'Creating...' : 'Create Tournament'}</button>
                </div>
            </form>
        </div>
    );
};

export default AdminTournamentCreatePage;
