import React, { useState } from 'react';
import * as api from '../../services/api';

const ChallengePlayer = ({ token, onChallenge, onError, isBanned }) => {
    const [username, setUsername] = useState('');
    const [searchResult, setSearchResult] = useState(null);
    const [isLoading, setIsLoading] = useState(false);

    const handleFindPlayer = async (e) => {
        e.preventDefault();
        setIsLoading(true);
        setSearchResult(null);
        try {
            const foundPlayer = await api.findPlayer(username, token);
            setSearchResult(
                <div className="flex justify-between items-center">
                    <p>Found player: <strong>{foundPlayer.linked_roblox_username}</strong></p>
                    <button onClick={() => onChallenge(foundPlayer)} className="btn-primary !mt-0 !w-auto !py-1 !px-3 !text-sm">Challenge</button>
                </div>
            );
        } catch (error) {
            setSearchResult(<p className="text-[var(--loss-color)]">{error.message}</p>);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="widget">
            <h2 className="widget-title">Challenge a Player</h2>
            <form onSubmit={handleFindPlayer}>
                <div className="form-group mb-4">
                    <label htmlFor="player-search-input" className="block text-sm font-medium text-gray-400 mb-1">Opponent's Roblox Username</label>
                    <div className="flex items-center gap-2">
                        <input 
                            id="player-search-input" 
                            type="text" 
                            value={username} 
                            onChange={e => setUsername(e.target.value)} 
                            placeholder="Enter username..." 
                            required 
                            className="form-input flex-grow"
                            disabled={isBanned}
                        />
                        <button type="submit" className="btn btn-primary !mt-0 w-1/4" disabled={isLoading || isBanned}>
                            {isLoading ? '...' : 'Find'}
                        </button>
                    </div>
                </div>
            </form>
            {searchResult && <div className="mt-4 p-3 bg-gray-900 rounded-lg border border-gray-700">{searchResult}</div>}
        </div>
    );
};

export default ChallengePlayer;
