import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

const Loader = () => (
    <div className="flex items-center justify-center p-12">
        <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
    </div>
);

const TranscriptViewerPage = () => {
    const { duelId } = useParams();
    const [duel, setDuel] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        const fetchTranscript = async () => {
            try {
                // Using fetch directly as this is a public page and doesn't need the auth wrapper from api.js
                const response = await fetch(`${API_BASE_URL}/api/transcripts/${duelId}`);
                if (!response.ok) {
                    const errData = await response.json();
                    throw new Error(errData.message || `Error: ${response.status}`);
                }
                const data = await response.json();
                setDuel(data);
            } catch (err) {
                setError(err.message);
            } finally {
                setIsLoading(false);
            }
        };
        fetchTranscript();
    }, [duelId]);

    const renderEvent = (event, index) => {
        const time = new Date(event.timestamp).toLocaleTimeString();
        let content = `[${time}] ${event.eventType}`;
        
        if (event.data && Object.keys(event.data).length > 0) {
             content += `: ${JSON.stringify(event.data)}`;
        }

        let style = 'text-gray-400';
        if (event.eventType === 'PARSED_ELIMINATION') style = 'text-red-400';
        if (event.eventType === 'DUEL_STARTED' || event.eventType === 'PARSED_DUEL_ENDED') style = 'text-green-400 font-bold';
        
        return <pre key={index} className={`whitespace-pre-wrap break-words text-sm ${style}`}>{content}</pre>
    };

    return (
        <div className="min-h-screen bg-gray-900 text-white p-4 sm:p-6 lg:p-8">
            <div className="max-w-4xl mx-auto">
                <header className="flex justify-between items-center mb-6 pb-4 border-b border-gray-700">
                    <div>
                        <h1 className="text-3xl font-bold">Duel Transcript</h1>
                        <p className="text-gray-500">ID: {duelId}</p>
                    </div>
                    <Link to="/dashboard" className="btn btn-secondary !mt-0">Back to Blox Battles</Link>
                </header>

                {isLoading && <Loader />}
                {error && <div className="p-4 text-center bg-red-900/50 text-red-300 rounded-lg">{error}</div>}
                {duel && (
                    <>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                            <div className="widget !p-4">
                                <h3 className="text-lg font-semibold mb-2">Duel Details</h3>
                                <p><strong>Challenger:</strong> {duel.challenger_username}</p>
                                <p><strong>Opponent:</strong> {duel.opponent_username}</p>
                                <p><strong>Winner:</strong> {duel.winner_username || 'N/A'}</p>
                                <p><strong>Wager:</strong> {duel.wager.toLocaleString()} Gems</p>
                                <p><strong>Map:</strong> {duel.map}</p>
                            </div>
                        </div>
                        <div className="widget">
                            <h3 className="widget-title">Event Log</h3>
                            <div className="p-4 bg-black rounded-lg font-mono max-h-[60vh] overflow-y-auto">
                                {duel.transcript && duel.transcript.length > 0 ? (
                                    duel.transcript.map(renderEvent)
                                ) : (
                                    <p className="text-gray-500">No events recorded in this transcript.</p>
                                )}
                            </div>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
};

export default TranscriptViewerPage;
