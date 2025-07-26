import React, { useState, useEffect } from 'react';
import * as api from '../../services/api';

// --- Base Modal Component ---
const CloseIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>;

const Modal = ({ children, isOpen, onClose, title }) => {
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50 p-4">
            <div className="widget w-full max-w-2xl max-h-[90vh] flex flex-col relative">
                <header className="p-4 border-b border-gray-700 flex justify-between items-center flex-shrink-0">
                    <h2 className="text-xl font-bold text-gray-100">{title}</h2>
                    {onClose && <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors"><CloseIcon /></button>}
                </header>
                <div className="p-6 overflow-y-auto">{children}</div>
            </div>
        </div>
    );
};


// --- Post Duel Result & Dispute Modal ---
export const PostDuelModal = ({ isOpen, result, currentUser, onConfirm, onDispute }) => {
    const [view, setView] = useState('result');
    const [reason, setReason] = useState('');
    const [hasVideo, setHasVideo] = useState(false);
    const [countdown, setCountdown] = useState(120);

    const isWinner = result?.winner_id === currentUser?.id;
    const opponentUsername = isWinner ? result?.loser_username : result?.winner_username;

    useEffect(() => {
        if (isOpen) {
            setView('result');
            setReason('');
            setHasVideo(false);
            setCountdown(120);

            const timer = setInterval(() => {
                setCountdown(prev => {
                    if (prev <= 1) {
                        clearInterval(timer);
                        onConfirm(result.id);
                        return 0;
                    }
                    return prev - 1;
                });
            }, 1000);

            return () => clearInterval(timer);
        }
    }, [isOpen, result, onConfirm]);

    if (!isOpen || !result) return null;

    const handleDisputeSubmit = (e) => {
        e.preventDefault();
        onDispute(result.id, { reason, has_video_evidence: hasVideo });
    };

    return (
        <Modal isOpen={isOpen} title="Duel Results">
            {view === 'result' && (
                <div className="text-center">
                    <h3 className={`text-5xl font-black mb-2 ${isWinner ? 'text-green-400' : 'text-red-500'}`}>
                        {isWinner ? 'VICTORY' : 'DEFEAT'}
                    </h3>
                    <p className="text-gray-300">
                        You {isWinner ? 'defeated' : 'were defeated by'} <span className="font-bold">{opponentUsername}</span>.
                    </p>
                    <p className={`text-lg font-bold mt-4 ${isWinner ? 'text-green-400' : 'text-red-500'}`}>
                        {isWinner ? '+' : '-'}{result.wager} Gems
                    </p>
                    <div className="mt-6 p-3 bg-yellow-900/50 border border-yellow-700 rounded-lg">
                        <p className="text-yellow-300 font-bold">This is your only chance to dispute the outcome.</p>
                        <p className="text-yellow-400 text-sm">Result will be auto-confirmed in: {Math.floor(countdown / 60)}:{(countdown % 60).toString().padStart(2, '0')}</p>
                    </div>
                    <div className="modal-actions mt-6">
                        <button onClick={() => setView('dispute')} className="btn btn-secondary">Dispute Outcome</button>
                        <button onClick={() => onConfirm(result.id)} className="btn btn-primary">Confirm Result</button>
                    </div>
                </div>
            )}

            {view === 'dispute' && (
                <form onSubmit={handleDisputeSubmit}>
                    <h3 className="text-2xl font-bold text-center mb-4">File a Dispute</h3>
                    <p className="text-gray-400 text-center mb-6">Provide a reason for the dispute. An admin will review the case. False reports may result in penalties.</p>
                    <div className="form-group">
                        <label htmlFor="dispute-reason">Reason</label>
                        <textarea
                            id="dispute-reason"
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            required
                            className="form-input !h-24"
                            placeholder="e.g., The player was exploiting a glitch, using banned items not declared, etc."
                        ></textarea>
                    </div>
                    <div className="form-group">
                        <label className="flex items-center gap-3 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={hasVideo}
                                onChange={(e) => setHasVideo(e.target.checked)}
                                className="h-5 w-5 rounded bg-gray-700 border-gray-600 text-blue-500 focus:ring-blue-500"
                            />
                            <span className="text-gray-300">I have a screen recording of the incident</span>
                        </label>
                    </div>
                    <div className="modal-actions mt-6">
                        <button type="button" onClick={() => setView('result')} className="btn btn-secondary">Back</button>
                        <button type="submit" className="btn btn-danger">Submit Dispute</button>
                    </div>
                </form>
            )}
        </Modal>
    );
};


// --- Existing Modals ---

export const ChallengeModal = ({ isOpen, onClose, opponent, currentUser, gameData, onChallengeSubmit, onError, token }) => {
    const [wager, setWager] = useState(100);
    const [selectedMap, setSelectedMap] = useState('');
    const [bannedWeapons, setBannedWeapons] = useState([]);
    const [selectedRegion, setSelectedRegion] = useState('North America');
    const [botStatuses, setBotStatuses] = useState([]);

    useEffect(() => {
        if (isOpen) {
            const fetchStatus = async () => {
                try {
                    const statuses = await api.getBotStatus(token);
                    setBotStatuses(statuses);
                } catch (error) {
                    console.error("Failed to fetch bot statuses:", error);
                }
            };

            fetchStatus();
            const interval = setInterval(fetchStatus, 10000);

            return () => clearInterval(interval);
        }
    }, [isOpen, token]);

    useEffect(() => {
        if (isOpen) {
            setWager(100);
            setSelectedMap('');
            setBannedWeapons([]);
            setSelectedRegion('North America');
        }
    }, [isOpen]);

    if (!opponent || !currentUser) return null;

    const handleWeaponToggle = (weaponId) => {
        setBannedWeapons(prev => 
            prev.includes(weaponId) ? prev.filter(id => id !== weaponId) : [...prev, weaponId]
        );
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!selectedMap) { onError("Please select a map.", "error"); return; }
        if (wager > currentUser.gems) { onError("You do not have enough gems for this wager.", "error"); return; }
        
        onChallengeSubmit({
            opponent_id: opponent.id, 
            wager: parseInt(wager, 10), 
            map: selectedMap, 
            banned_weapons: bannedWeapons,
            region: selectedRegion,
        });
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Create a Duel">
            <form onSubmit={handleSubmit} className="space-y-6">
                <div className="vs-card">
                    <div className="player-display self">
                        <img src={currentUser.roblox_avatar_url || 'https://placehold.co/70x70/161b22/7d8590?text=R'} alt="You" />
                        <h4>{currentUser.linked_roblox_username}</h4>
                    </div>
                    <div className="vs-text">VS</div>
                    <div className="player-display opponent">
                         <img src={opponent?.avatar_url || 'https://placehold.co/70x70/161b22/7d8590?text=R'} alt={opponent?.linked_roblox_username} />
                        <h4>{opponent?.linked_roblox_username}</h4>
                    </div>
                </div>
                
                <div className="form-group">
                    <label>Select a Region</label>
                    <div className="flex items-center gap-2">
                        {['North America', 'Europe', 'Oceania'].map(region => {
                            const statusInfo = botStatuses.find(s => s.region === region);
                            const isOnline = statusInfo?.status === 'online';
                            return (
                                <button 
                                    key={region} 
                                    type="button" 
                                    onClick={() => setSelectedRegion(region)} 
                                    className={`flex-1 p-3 rounded-md border-2 font-semibold transition-all flex items-center justify-center gap-2 ${selectedRegion === region ? 'border-blue-500 bg-blue-500/20' : 'border-transparent bg-gray-700/50 hover:bg-gray-600/50'}`}
                                >
                                    <span 
                                        className={`w-3 h-3 rounded-full ${isOnline ? 'bg-green-500' : 'bg-red-500'}`}
                                        title={isOnline ? 'Online' : 'Offline'}
                                    ></span>
                                    {region}
                                </button>
                            );
                        })}
                    </div>
                </div>

                <div className="form-group">
                    <label>Select a Map</label>
                    <div id="map-selector" className="max-h-36 overflow-y-auto">
                        {gameData.maps.map(map => (
                            <button key={map.id} type="button" onClick={() => setSelectedMap(map.id)} className={`map-card ${selectedMap === map.id ? 'selected' : ''}`}>
                                <span className="map-name">{map.name}</span>
                            </button>
                        ))}
                    </div>
                </div>

                <div className="form-group">
                    <label>Ban Weapons (Optional)</label>
                    <div id="weapon-ban-selector" className="max-h-48 overflow-y-auto">
                        {gameData.weapons.map(weapon => (
                            <div key={weapon.id} className="weapon-toggle">
                                <label>
                                    <input type="checkbox" value={weapon.id} onChange={() => handleWeaponToggle(weapon.id)} checked={bannedWeapons.includes(weapon.id)} />
                                    {weapon.name}
                                </label>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="modal-actions">
                     <div className="form-group !mb-0 flex-grow max-w-[150px]">
                        <label htmlFor="wager-input">Wager (Gems)</label>
                        <input id="wager-input" type="number" value={wager} onChange={e => setWager(e.target.value)} min="1" max={currentUser.gems} required />
                    </div>
                    <button type="submit" className="btn btn-primary !mt-0">Send Challenge</button>
                </div>
            </form>
        </Modal>
    );
};

export const DuelDetailsModal = ({ isOpen, onClose, duel, onRespond }) => {
    if (!duel?.data) return null;

    const duelDetails = duel.data;

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Incoming Challenge!">
            <div id="duel-details-content" className="space-y-2">
                <p><strong>Challenger:</strong> {duelDetails.challenger_username}</p>
                <p><strong>Wager:</strong> <span className="font-bold text-[var(--accent-color)]">{duelDetails.wager} Gems</span></p>
                <p><strong>Map:</strong> {duelDetails.map_name}</p>
                <div className="banned-weapons-section">
                    <strong>Banned Weapons:</strong>
                    <ul className="banned-weapons-list">
                        {duelDetails.banned_weapons && duelDetails.banned_weapons.length > 0 ? (
                            duelDetails.banned_weapons.map(w => <li key={w}>{w}</li>)
                        ) : <li>None</li>}
                    </ul>
                </div>
            </div>
            <div className="modal-actions">
                <button onClick={() => onRespond(duelDetails.id, 'decline')} className="btn btn-danger">Decline</button>
                <button onClick={() => onRespond(duelDetails.id, 'accept')} className="btn btn-accept">Accept</button>
            </div>
        </Modal>
    );
};

export const ConfirmationModal = ({ isOpen, onClose, onConfirm, title, text, confirmText, children }) => {
    if (!isOpen) return null;
    return (
        <Modal isOpen={isOpen} onClose={onClose} title={title}>
            <div className="p-2">
                <p className="text-gray-300">{text}</p>
                {children}
                <div className="modal-actions">
                    <button onClick={onClose} className="btn btn-secondary !bg-[var(--btn-secondary-bg)] hover:!bg-[var(--btn-secondary-hover-bg)]">
                        Nevermind
                    </button>
                    <button onClick={onConfirm} className="btn btn-danger">
                        {confirmText || 'Confirm'}
                    </button>
                </div>
            </div>
        </Modal>
    );
};

export const TranscriptModal = ({ isOpen, onClose, transcript }) => {
    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Duel Transcript">
            <div className="space-y-2 font-mono text-sm max-h-[60vh] overflow-y-auto bg-black rounded-lg p-3 border border-gray-700">
                {transcript.length > 0 ? transcript.map((event, index) => (
                    <pre 
                        key={index} 
                        className="p-3 rounded-md bg-gray-900 border border-gray-800 whitespace-pre-wrap break-words text-xs text-white"
                    >
                        {JSON.stringify(event, null, 2)}
                    </pre>
                )) : <p className="text-center text-gray-500 p-4">Loading transcript or no events recorded.</p>}
            </div>
        </Modal>
    );
};
