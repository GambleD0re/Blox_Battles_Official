import React, { useState, useEffect, useRef } from 'react';

const formatGems = (amount) => {
    if (amount >= 1000) {
        return `${(amount / 1000).toFixed(1)}k`;
    }
    return amount.toString();
};

const DuelCard = ({ duel, onRemove }) => {
    const { winner, loser, score, wager, pot } = duel;

    return (
        <div className="flex-shrink-0 w-96 h-24 bg-gray-900/50 border border-gray-700 rounded-lg p-2 flex items-center justify-between animate-slide-in" onAnimationEnd={onRemove}>
            <div className={`relative w-1/2 h-full flex items-center p-2 rounded-md border-2 bg-gray-800/50 border-green-500/80 scale-105 shadow-lg shadow-green-500/10`}>
                <div className="relative w-16 h-16">
                    <div className="absolute inset-0 bg-gray-700 rounded-full" style={{ clipPath: 'polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%)' }}>
                         <img src={winner.avatarUrl || 'https://placehold.co/64x64'} alt={winner.username} className="w-full h-full object-cover rounded-full" />
                    </div>
                </div>
                <span className="font-bold text-white text-lg ml-2 truncate">{winner.username}</span>
            </div>

            <div className="text-center mx-2">
                <div className="font-black text-2xl text-white">{score ? `${score[Object.keys(score)[0]]} - ${score[Object.keys(score)[1]]}` : 'N/A'}</div>
                <div className="font-bold text-sm text-green-400" title={`Wager: ${wager}, Pot: ${pot}`}>{formatGems(pot)} Gems</div>
            </div>

            <div className="w-1/2 h-full flex items-center p-2 rounded-md border-2 bg-gray-800/50 border-gray-600 justify-end">
                <span className="font-bold text-white text-lg mr-2 truncate text-right">{loser.username}</span>
                 <div className="relative w-16 h-16">
                    <div className="absolute inset-0 bg-gray-700 rounded-full" style={{ clipPath: 'polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%)' }}>
                       <img src={loser.avatarUrl || 'https://placehold.co/64x64'} alt={loser.username} className="w-full h-full object-cover rounded-full" />
                    </div>
                </div>
            </div>
        </div>
    );
};

const LiveFeed = () => {
    const [duels, setDuels] = useState([]);
    const ws = useRef(null);

    useEffect(() => {
        const connect = () => {
            const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const wsUrl = `${wsProtocol}//${window.location.host}`;
            ws.current = new WebSocket(wsUrl);

            ws.current.onopen = () => {
                console.log('[WebSocket] Live Feed connected.');
            };

            ws.current.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    if (data.type === 'live_feed_update') {
                        setDuels(prevDuels => [...prevDuels, { ...data.payload, key: data.payload.id + Date.now() }]);
                    }
                } catch (error) {
                    console.error('[WebSocket] Error parsing message:', error);
                }
            };

            ws.current.onerror = (error) => {
                console.error('[WebSocket] Error:', error);
            };

            ws.current.onclose = () => {
                console.log('[WebSocket] Live Feed disconnected. Reconnecting...');
                setTimeout(connect, 5000);
            };
        };

        connect();

        const initDuelTimer = setTimeout(() => {
            const initDuel = {
                id: 'init-duel',
                key: 'init-duel' + Date.now(),
                winner: { username: 'Dueler 1', avatarUrl: '' },
                loser: { username: 'Dueler 2', avatarUrl: '' },
                score: { team1: 5, team2: 3 },
                wager: 100,
                pot: 196,
                isInitialization: true
            };
            setDuels(prev => [...prev, initDuel]);
        }, 20000);

        return () => {
            clearTimeout(initDuelTimer);
            if (ws.current) {
                ws.current.close();
            }
        };
    }, []);

    useEffect(() => {
        if (duels.some(d => d.isInitialization)) {
            const removeTimer = setTimeout(() => {
                setDuels(prev => prev.filter(d => !d.isInitialization));
            }, 20000);
            return () => clearTimeout(removeTimer);
        }
    }, [duels]);

    const handleRemoveDuel = (key) => {
        setDuels(prevDuels => prevDuels.filter(d => d.key !== key));
    };
    
    return (
        <div className="fixed bottom-0 left-0 right-0 h-32 bg-black/50 backdrop-blur-sm border-t-2 border-gray-800 flex items-center overflow-hidden z-40">
            <div className="absolute left-0 top-0 bottom-0 w-12 bg-purple-600/80 flex items-center justify-center rounded-r-lg">
                <span className="text-white font-black text-2xl transform -rotate-90 tracking-widest">LIVE</span>
            </div>
            <div className="absolute right-0 top-0 bottom-0 w-12 bg-yellow-400/80 flex items-center justify-center rounded-l-lg">
                <span className="text-black font-black text-2xl transform -rotate-90 tracking-widest">FEED</span>
            </div>
            <div className="flex-grow flex items-center gap-4 animate-scroll-left pl-16 pr-16">
                {duels.slice(-3).map(duel => (
                    <DuelCard key={duel.key} duel={duel} onRemove={() => { if (duels.length > 3) { handleRemoveDuel(duel.key) }}} />
                ))}
            </div>
        </div>
    );
};

export default LiveFeed;
