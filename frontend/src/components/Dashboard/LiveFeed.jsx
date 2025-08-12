import React, { useState, useEffect, useRef } from 'react';

const formatGems = (amount) => {
    if (amount >= 1000) {
        return `${(amount / 1000).toFixed(1)}k`;
    }
    return amount.toString();
};

const DuelCard = ({ duel }) => {
    const { winner, loser, score, wager, pot } = duel;

    return (
        <div className="flex-shrink-0 w-[45%] h-24 bg-gray-900/60 border border-gray-700 rounded-lg p-2 flex items-center justify-between">
            {/* Winner Side */}
            <div className="relative w-1/2 h-full flex items-center p-2 rounded-md border-2 bg-gray-800/50 border-green-400 shadow-[0_0_15px_rgba(52,211,153,0.3)]">
                <div className="relative w-16 h-16 flex-shrink-0">
                    <div className="absolute inset-0 bg-gray-700 rounded-full" style={{ clipPath: 'polygon(0 15%, 100% 15%, 100% 100%, 0% 100%)' }}>
                         <img src={winner.avatarUrl || `https://ui-avatars.com/api/?name=${winner.username}&background=2d3748&color=e2e8f0`} alt={winner.username} className="w-full h-full object-cover rounded-full" />
                    </div>
                </div>
                <span className="font-bold text-white text-lg ml-3 truncate">{winner.username}</span>
            </div>

            {/* Center Info */}
            <div className="text-center mx-3 flex-shrink-0">
                <div className="font-black text-2xl text-white">{score ? `${score[Object.keys(score)[0]]} - ${score[Object.keys(score)[1]]}` : 'N/A'}</div>
                <div className="font-bold text-sm text-green-400" title={`Wager: ${wager}, Pot: ${pot}`}>{formatGems(pot)} Gems</div>
            </div>

            {/* Loser Side */}
            <div className="w-1/2 h-full flex items-center p-2 rounded-md border-2 bg-gray-800/50 border-gray-600 justify-end">
                <span className="font-bold text-white text-lg mr-3 truncate text-right">{loser.username}</span>
                 <div className="relative w-16 h-16 flex-shrink-0">
                    <div className="absolute inset-0 bg-gray-700 rounded-full" style={{ clipPath: 'polygon(0 15%, 100% 15%, 100% 100%, 0% 100%)' }}>
                       <img src={loser.avatarUrl || `https://ui-avatars.com/api/?name=${loser.username}&background=2d3748&color=e2e8f0`} alt={loser.username} className="w-full h-full object-cover rounded-full" />
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

            ws.current.onopen = () => console.log('[WebSocket] Live Feed connected.');
            ws.current.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    if (data.type === 'live_feed_update') {
                        setDuels(prev => [...prev, { ...data.payload, key: data.payload.id + Date.now() }]);
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

        const initDuelTimer = setTimeout(() => {
            setDuels(prev => [...prev, {
                id: 'init-duel', key: 'init-duel-1',
                winner: { username: 'Dueler 1', avatarUrl: null },
                loser: { username: 'Dueler 2', avatarUrl: null },
                score: { team1: 5, team2: 3 }, wager: 100, pot: 196,
                isInitialization: true
            }]);
        }, 20000);
        
        const removeInitDuelTimer = setTimeout(() => {
            setDuels(prev => prev.filter(d => d.id !== 'init-duel'));
        }, 40000);

        return () => {
            clearTimeout(initDuelTimer);
            clearTimeout(removeInitDuelTimer);
            if (ws.current) ws.current.close();
        };
    }, []);
    
    return (
        <div className="fixed bottom-0 left-0 right-0 h-32 bg-black/60 backdrop-blur-md border-t-2 border-gray-800 flex items-center overflow-hidden z-40 rounded-t-lg">
            <div className="absolute left-0 top-0 bottom-0 w-12 flex items-center justify-center">
                <span className="text-purple-400 font-black text-2xl tracking-widest" style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>LIVE</span>
            </div>
            <div className="absolute right-0 top-0 bottom-0 w-12 flex items-center justify-center">
                <span className="text-yellow-300 font-black text-2xl tracking-widest" style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>FEED</span>
            </div>
            
            <div className="w-full h-full flex items-center">
                <div className="w-full flex gap-8 animate-marquee pl-16 pr-16">
                    {duels.map(duel => <DuelCard key={duel.key} duel={duel} />)}
                    {duels.length > 0 && duels.map(duel => <DuelCard key={`${duel.key}-clone`} duel={duel} />)}
                </div>
            </div>
        </div>
    );
};

export default LiveFeed;
