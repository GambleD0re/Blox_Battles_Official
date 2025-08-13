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
        <div className="flex-shrink-0 w-96 h-24 bg-gray-900/60 border border-gray-700 rounded-lg p-2 flex items-center justify-between">
            {/* Winner Side */}
            <div className="relative w-1/2 h-full flex items-center p-2 rounded-md border-2 bg-gray-800/50 border-green-400 shadow-[0_0_15px_rgba(52,211,153,0.3)]">
                <img src={winner.avatarUrl || `https://ui-avatars.com/api/?name=${winner.username.charAt(0)}&background=2d3748&color=e2e8f0`} alt={winner.username} className="w-16 h-16 object-cover rounded-full flex-shrink-0" />
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
                <img src={loser.avatarUrl || `https://ui-avatars.com/api/?name=${loser.username.charAt(0)}&background=2d3748&color=e2e8f0`} alt={loser.username} className="w-16 h-16 object-cover rounded-full flex-shrink-0" />
            </div>
        </div>
    );
};

const LiveFeed = () => {
    const [duels, setDuels] = useState([]);
    const duelCounter = useRef(1);
    const ws = useRef(null);
    const MAX_VISIBLE_DUELS = 2;

    // This primary effect handles adding new duels from WebSockets or test timers
    useEffect(() => {
        const addDuel = (newDuelData) => {
            const newDuel = {
                ...newDuelData,
                key: newDuelData.id + Date.now(),
                status: 'entering', // Initial state for animation
            };

            setDuels(currentDuels => {
                // Add the new duel and mark existing ones for animation
                const updatedDuels = [
                    newDuel,
                    ...currentDuels.map(d => ({ ...d, status: d.status === 'visible' ? 'visible' : 'exiting' }))
                ];

                // Mark duels that are pushed out as 'exiting'
                const visibleAndEntering = updatedDuels.filter(d => d.status !== 'exiting');
                const toExit = visibleAndEntering.slice(MAX_VISIBLE_DUELS);
                const toExitKeys = new Set(toExit.map(d => d.key));

                let finalDuels = updatedDuels.map(d => {
                    if (toExitKeys.has(d.key)) {
                        return { ...d, status: 'exiting' };
                    }
                    return d;
                });
                
                return finalDuels;
            });
        };

        const connect = () => {
            const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const wsUrl = `${wsProtocol}//${window.location.host}`;
            ws.current = new WebSocket(wsUrl);

            ws.current.onopen = () => console.log('[WebSocket] Live Feed connected.');
            ws.current.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    if (data.type === 'live_feed_update') {
                        addDuel(data.payload);
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

        let intervalId;
        const startTestDuels = () => {
            // Function to create and add one test duel
            const createAndAddDuel = () => {
                 const winnerNum = duelCounter.current++;
                 const loserNum = duelCounter.current++;
                 const testDuel = {
                    id: `test-duel-${winnerNum}`,
                    winner: { username: `Dueler ${winnerNum}`, avatarUrl: null },
                    loser: { username: `Dueler ${loserNum}`, avatarUrl: null },
                    score: { team1: 5, team2: 3 }, wager: 100, pot: 196
                };
                addDuel(testDuel);
            };
            
            // Add the first duel
            createAndAddDuel();
            // Set an interval to add subsequent duels
            intervalId = setInterval(createAndAddDuel, 10000);
        };
        // Wait 10 seconds before starting the test duel cycle
        const initialTimeout = setTimeout(startTestDuels, 10000);

        return () => {
            if (ws.current) ws.current.close();
            clearTimeout(initialTimeout);
            clearInterval(intervalId);
        };
    }, []);

    // This secondary effect handles cleaning up the state after animations complete
    useEffect(() => {
        if (!duels.length) return;

        // Transition 'entering' cards to 'visible'
        const enteringKeys = new Set(duels.filter(d => d.status === 'entering').map(d => d.key));
        if (enteringKeys.size > 0) {
            const timer = setTimeout(() => {
                setDuels(currentDuels =>
                    currentDuels.map(d =>
                        enteringKeys.has(d.key) ? { ...d, status: 'visible' } : d
                    )
                );
            }, 50); // Short delay for CSS transition to catch the state change
            return () => clearTimeout(timer);
        }

        // Remove 'exiting' cards from state after their animation
        const exitingKeys = new Set(duels.filter(d => d.status === 'exiting').map(d => d.key));
        if (exitingKeys.size > 0) {
            const timer = setTimeout(() => {
                setDuels(currentDuels =>
                    currentDuels.filter(d => d.status !== 'exiting')
                );
            }, 800); // Must match the CSS transition duration
            return () => clearTimeout(timer);
        }
    }, [duels]);
    
    const getWrapperClass = (status) => {
        if (status === 'visible') return 'duel-card-wrapper animate-in';
        if (status === 'exiting') return 'duel-card-wrapper animate-out';
        return 'duel-card-wrapper'; // Default is the initial 'off-screen' state
    };
    
    return (
        <div className="fixed bottom-0 left-0 right-0 h-32 bg-black/60 backdrop-blur-md border-t-2 border-gray-800 flex items-center overflow-hidden z-40 rounded-t-lg">
            <div className="absolute left-0 top-0 bottom-0 w-12 flex items-center justify-center">
                <span className="text-purple-400 font-black text-2xl tracking-[.2em]" style={{ writingMode: 'vertical-rl' }}>LIVE</span>
            </div>
            <div className="absolute right-0 top-0 bottom-0 w-12 flex items-center justify-center">
                <span className="text-yellow-300 font-black text-2xl tracking-[.2em]" style={{ writingMode: 'vertical-rl' }}>FEED</span>
            </div>
            
            <div className="live-feed-container pl-16 pr-16">
                {duels.map(duel => (
                    <div key={duel.key} className={getWrapperClass(duel.status)}>
                        <DuelCard duel={duel} />
                    </div>
                ))}
            </div>
        </div>
    );
};

export default LiveFeed;
