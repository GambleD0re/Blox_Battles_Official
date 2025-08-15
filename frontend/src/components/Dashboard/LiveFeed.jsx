// START OF FILE frontend/components/Dashboard/LiveFeed.jsx ---
import React, { useState, useEffect, useRef } from 'react';

const formatGems = (amount) => {
    if (amount >= 1000) {
        return `${(amount / 1000).toFixed(1)}k`;
    }
    return amount.toString();
};

const DuelCard = ({ duel }) => {
    const { winner, loser, score, pot } = duel;

    return (
        <div className="flex-shrink-0 w-full h-20 bg-gray-900/60 border border-gray-700 rounded-lg p-2 flex items-center justify-between gap-2">
            <div className="flex items-center gap-3 flex-1 min-w-0">
                <img 
                    src={winner.avatarUrl || `https://ui-avatars.com/api/?name=${winner.username.charAt(0)}&background=2d3748&color=e2e8f0`} 
                    alt={winner.username} 
                    className="w-14 h-14 object-cover rounded-full border-2 border-green-400 flex-shrink-0"
                />
                <span className="font-bold text-white text-lg truncate">{winner.username}</span>
            </div>
            <div className="text-center flex-shrink-0 mx-4">
                <div className="font-black text-2xl text-white">{score ? `${score[Object.keys(score)[0]]} - ${score[Object.keys(score)[1]]}` : 'N/A'}</div>
                <div className="font-bold text-sm text-green-400" title={`Pot: ${pot}`}>{formatGems(pot)} Gems</div>
            </div>
            <div className="flex items-center justify-end gap-3 flex-1 min-w-0">
                <span className="font-bold text-white text-lg truncate text-right">{loser.username}</span>
                <img 
                    src={loser.avatarUrl || `https://ui-avatars.com/api/?name=${loser.username.charAt(0)}&background=2d3748&color=e2e8f0`} 
                    alt={loser.username} 
                    className="w-14 h-14 object-cover rounded-full border-2 border-gray-600 flex-shrink-0"
                />
            </div>
        </div>
    );
};

const ChevronDownIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>;
const ChevronUpIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="18 15 12 9 6 15"></polyline></svg>;

const LiveFeed = ({ token, onMatchFound }) => {
    const [duels, setDuels] = useState([]);
    const [isVisible, setIsVisible] = useState(() => localStorage.getItem('liveFeedVisible') !== 'false');
    const ws = useRef(null);
    const timeouts = useRef([]);

    const toggleVisibility = () => {
        const newVisibility = !isVisible;
        setIsVisible(newVisibility);
        localStorage.setItem('liveFeedVisible', newVisibility);
    };

    const onNewDuel = (duelData) => {
        const newDuel = { key: `duel-${duelData.id}-${Date.now()}`, position: 'enter', data: duelData };
        setDuels(currentDuels => {
            const updatedDuels = currentDuels.map(d => {
                if (d.position === 'slot1') return { ...d, position: 'slot2' };
                if (d.position === 'slot2') return { ...d, position: 'exit' };
                return d;
            });
            return [...updatedDuels, newDuel];
        });
    };

    useEffect(() => {
        if (!token) return;

        const connect = () => {
            const backendHttpUrl = import.meta.env.VITE_API_BASE_URL;
            if (!backendHttpUrl) return;
            const wsUrl = backendHttpUrl.replace(/^http/, 'ws');
            ws.current = new WebSocket(wsUrl);

            ws.current.onopen = () => {
                console.log('[WebSocket] Live Feed connected.');
                ws.current.send(JSON.stringify({ type: 'auth', token: token }));
            };
            
            ws.current.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    if (data.type === 'live_feed_history') {
                        const historyDuels = data.payload.map((duelData, index) => ({
                            key: `hist-${duelData.id}`, position: index === 0 ? 'slot1' : 'slot2', data: duelData
                        }));
                        setDuels(historyDuels);
                    } else if (data.type === 'live_feed_update') {
                        onNewDuel(data.payload);
                    } else if (data.type === 'match_found') {
                        onMatchFound(data.payload.serverLink);
                    }
                } catch (error) {
                    console.error('[WebSocket] Error parsing message:', error);
                }
            };

            ws.current.onerror = (error) => console.error('[WebSocket] Error:', error);
            ws.current.onclose = () => {
                console.log('[WebSocket] Live Feed disconnected. Reconnecting...');
                setTimeout(connect, 5000);
            };
        };

        connect();

        return () => {
            timeouts.current.forEach(clearTimeout);
            if (ws.current) {
                ws.current.close();
            }
        };
    }, [token, onMatchFound]);

    useEffect(() => {
        if (duels.some(d => d.position === 'enter')) {
            const enterTimer = setTimeout(() => {
                setDuels(currentDuels =>
                    currentDuels.map(d => (d.position === 'enter' ? { ...d, position: 'slot1' } : d))
                );
            }, 100);
            timeouts.current.push(enterTimer);
        }

        if (duels.some(d => d.position === 'exit')) {
            const exitTimer = setTimeout(() => {
                setDuels(currentDuels => currentDuels.filter(d => d.position !== 'exit'));
            }, 800);
            timeouts.current.push(exitTimer);
        }
    }, [duels]);
    
    return (
        <div className={`fixed bottom-0 left-0 right-0 z-40 transition-transform duration-300 ease-in-out ${isVisible ? 'translate-y-0' : 'translate-y-full'}`}>
            <button 
                onClick={toggleVisibility}
                className="absolute left-1/2 -translate-x-1/2 -top-6 w-12 h-6 bg-gray-800/80 backdrop-blur-md border-t border-l border-r border-gray-700 rounded-t-lg flex items-center justify-center text-gray-400 hover:text-white transition-colors"
                title={isVisible ? 'Hide Feed' : 'Show Feed'}
            >
                {isVisible ? <ChevronDownIcon /> : <ChevronUpIcon />}
            </button>
            <div className="h-28 bg-black/60 backdrop-blur-md border-t-2 border-gray-800 flex items-center overflow-hidden">
                <div className="flex-shrink-0 w-12 flex items-center justify-center">
                    <span className="text-purple-400 font-black text-2xl tracking-tighter" style={{ writingMode: 'vertical-rl', textOrientation: 'upright' }}>LIVE</span>
                </div>
                
                <div className="flex-grow h-full">
                    <div className="live-feed-cards-container">
                        {duels.map(duel => (
                            <div key={duel.key} className={`duel-card-wrapper pos-${duel.position}`}>
                                <DuelCard duel={duel.data} />
                            </div>
                        ))}
                    </div>
                </div>

                <div className="flex-shrink-0 w-12 flex items-center justify-center">
                    <span className="text-yellow-300 font-black text-2xl tracking-tighter" style={{ writingMode: 'vertical-rl', textOrientation: 'upright' }}>FEED</span>
                </div>
            </div>
        </div>
    );
};

export default LiveFeed;
