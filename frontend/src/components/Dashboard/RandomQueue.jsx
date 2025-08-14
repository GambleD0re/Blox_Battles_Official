import React, { useState, useEffect } from 'react';
import * as api from '../../services/api';
import { useAuth } from '../../context/AuthContext';

const Timer = ({ startTime }) => {
    const [elapsed, setElapsed] = useState(0);

    useEffect(() => {
        const start = new Date(startTime).getTime();
        const interval = setInterval(() => {
            setElapsed(Date.now() - start);
        }, 1000);
        return () => clearInterval(interval);
    }, [startTime]);

    const totalSeconds = Math.floor(elapsed / 1000);
    const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, '0');
    const seconds = (totalSeconds % 60).toString().padStart(2, '0');

    return <span className="font-mono">{minutes}:{seconds}</span>;
};

const RandomQueue = ({ gameData, token, showMessage, onQueueJoined }) => {
    const { user } = useAuth();
    const [queueStatus, setQueueStatus] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const [wager, setWager] = useState(100);
    const [region, setRegion] = useState('NA-East');
    const [bannedMap, setBannedMap] = useState('');
    const [bannedWeapons, setBannedWeapons] = useState([]);

    const wagerOptions = [50, 100, 200, 500, 1000];

    useEffect(() => {
        const fetchStatus = async () => {
            setIsLoading(true);
            try {
                const status = await api.getQueueStatus(token);
                setQueueStatus(status);
            } catch (error) {
                showMessage('Could not fetch queue status.', 'error');
            } finally {
                setIsLoading(false);
            }
        };
        fetchStatus();
    }, [token, showMessage]);

    const handleWeaponToggle = (weaponId) => {
        setBannedWeapons(prev => {
            if (prev.includes(weaponId)) {
                return prev.filter(id => id !== weaponId);
            }
            if (prev.length < 2) {
                return [...prev, weaponId];
            }
            return prev;
        });
    };

    const handleJoinQueue = async () => {
        if (!bannedMap) return showMessage('You must select a map to ban.', 'error');
        if (bannedWeapons.length !== 2) return showMessage('You must select exactly 2 weapons to ban.', 'error');
        
        setIsSubmitting(true);
        try {
            await api.joinQueue({ wager, region, banned_map: bannedMap, banned_weapons: bannedWeapons }, token);
            const status = await api.getQueueStatus(token);
            setQueueStatus(status);
            onQueueJoined(); // Close the modal on success
            showMessage('You have joined the queue! Waiting for a match.', 'success');
        } catch (error) {
            showMessage(error.message, 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleLeaveQueue = async () => {
        setIsSubmitting(true);
        try {
            await api.leaveQueue(token);
            setQueueStatus(null);
            showMessage('You have left the queue.', 'success');
        } catch (error) {
            showMessage(error.message, 'error');
        } finally {
            setIsSubmitting(false);
        }
    };
    
    // This part is now rendered outside the modal, directly on the dashboard if needed.
    if (queueStatus && !isLoading) {
        return (
            <div className="widget text-center">
                <h2 className="widget-title">Searching for Match...</h2>
                <div className="flex items-center justify-center gap-4 my-4">
                    <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                    <div className="text-3xl font-bold text-white"><Timer startTime={queueStatus.created_at} /></div>
                </div>
                <p className="text-gray-400">Wager: {queueStatus.wager} Gems | Region: {queueStatus.region}</p>
                <button onClick={handleLeaveQueue} disabled={isSubmitting} className="btn btn-danger w-full mt-4">
                    {isSubmitting ? 'Leaving...' : 'Leave Queue'}
                </button>
            </div>
        )
    }

    if (isLoading) {
        return <div className="text-center p-8">Loading...</div>;
    }
    
    return (
        <div className="space-y-4">
            <div className="form-group">
                <label>Wager</label>
                <div className="flex items-center gap-2">
                    {wagerOptions.map(opt => (
                        <button key={opt} onClick={() => setWager(opt)} className={`flex-1 p-2 rounded-md border-2 font-semibold transition-all ${wager === opt ? 'border-blue-500 bg-blue-500/20' : 'border-transparent bg-gray-700/50 hover:bg-gray-600/50'}`}>
                            {opt}
                        </button>
                    ))}
                </div>
            </div>
            <div className="form-group">
                <label>Region</label>
                <select value={region} onChange={e => setRegion(e.target.value)} className="form-input">
                    {gameData.regions.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
            </div>
            <div className="form-group">
                <label>Ban One Map</label>
                <select value={bannedMap} onChange={e => setBannedMap(e.target.value)} className="form-input">
                    <option value="" disabled>Select a map...</option>
                    {gameData.maps.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
            </div>
            <div className="form-group">
                <label>Ban Two Weapons ({bannedWeapons.length}/2)</label>
                <div className="grid grid-cols-2 gap-2 p-2 bg-gray-900/50 rounded-lg max-h-40 overflow-y-auto">
                    {gameData.weapons.map(w => (
                        <label key={w.id} className={`p-2 text-sm text-center rounded-md cursor-pointer transition-colors ${bannedWeapons.includes(w.id) ? 'bg-red-600 text-white' : 'bg-gray-700 hover:bg-gray-600'}`}>
                            <input type="checkbox" checked={bannedWeapons.includes(w.id)} onChange={() => handleWeaponToggle(w.id)} className="hidden" />
                            {w.name}
                        </label>
                    ))}
                </div>
            </div>
            <div className="modal-actions">
                <button onClick={handleJoinQueue} disabled={isSubmitting || user.gems < wager} className="btn btn-primary w-full">
                    {isSubmitting ? 'Joining...' : `Join Queue (${wager} Gems)`}
                </button>
            </div>
        </div>
    );
};

export default RandomQueue;
