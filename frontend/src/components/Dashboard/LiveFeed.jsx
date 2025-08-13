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
        <div className="flex-shrink-0 w-96 h-24 bg-gray-900/60 border border-gray-700 rounded-lg p-2 flex items-center justify-between gap-2">
            <div className="flex-1 min-w-0 h-full flex items-center p-2 rounded-md border-2 bg-gray-800/50 border-green-400 shadow-[0_0_15px_rgba(52,211,153,0.3)]">
                <img src={winner.avatarUrl || `https://ui-avatars.com/api/?name=${winner.username.charAt(0)}&background=2d3748&color=e2e8f0`} alt={winner.username} className="w-16 h-16 object-cover rounded-full flex-shrink-0" />
                <span className="font-bold text-white text-lg ml-2 truncate">{winner.username}</span>
            </div>

            <div className="text-center flex-shrink-0">
                <div className="font-black text-2xl text-white">{score ? `${score[Object.keys(score)[0]]} - ${score[Object.keys(score)[1]]}` : 'N/A'}</div>
                <div className="font-bold text-sm text-green-400" title={`Pot: ${pot}`}>{formatGems(pot)} Gems</div>
            </div>

            <div className="flex-1 min-w-0 h-full flex items-center p-2 rounded-md border-2 bg-gray-800/50 border-gray-600 justify-end">
                <span className="font-bold text-white text-lg mr-2 truncate text-right">{loser.username}</span>
                <img src={loser.avatarUrl || `https://ui-avatars.com/api/?name=${loser.username.charAt(0)}&background=2d3748&color=e2e8f0`} alt={loser.username} className="w-16 h-16 object-cover rounded-full flex-shrink-0" />
            </div>
        </div>
    );
};

const LiveFeed = () => {
    const [duels, setDuels] = useState([]);
    const ws = useRef(null);
    const timeouts = useRef([]);
    const testCounter = useRef(0);

    const onNewDuel = (duelData) => {
        const newDuel = {
            key: `duel-${duelData.id}-${Date.now()}`,
            position: 'enter',
            data: duelData,
        };

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
        const connect = () => {
            const wsUrl = 'wss://blox-battles-backend.onrender.com';
            ws.current = new WebSocket(wsUrl);

            ws.current.onopen = () => console.log('[WebSocket] Live Feed connected.');
            ws.current.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    if (data.type === 'live_feed_update') {
                        onNewDuel(data.payload);
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

        const testInterval = setInterval(() => {
            testCounter.current++;
            const testDuelData = {
                id: `test-${testCounter.current}`,
                winner: { username: `Winner${testCounter.current}`, avatarUrl: null },
                loser: { username: `Loser${testCounter.current}`, avatarUrl: null },
                score: { team1: Math.floor(Math.random() * 5) + 1, team2: Math.floor(Math.random() * 5) + 1 },
                wager: Math.floor(Math.random() * 500),
                pot: Math.floor(Math.random() * 1000),
            };
            onNewDuel(testDuelData);
        }, 30000);

        return () => {
            timeouts.current.forEach(clearTimeout);
            clearInterval(testInterval);
            if (ws.current) ws.current.close();
        };
    }, []);

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
        <div className="fixed bottom-0 left-0 right-0 h-32 bg-black/60 backdrop-blur-md border-t-2 border-gray-800 flex items-center overflow-hidden z-40 rounded-t-lg">
            <div className="flex-shrink-0 w-12 flex items-center justify-center">
                <span className="text-purple-400 font-black text-2xl tracking-[.2em]" style={{ writingMode: 'vertical-rl', textOrientation: 'upright' }}>LIVE</span>
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
                <span className="text-yellow-300 font-black text-2xl tracking-[.2em]" style={{ writingMode: 'vertical-rl', textOrientation: 'upright' }}>FEED</span>
            </div>
        </div>
    );
};

export default LiveFeed;
