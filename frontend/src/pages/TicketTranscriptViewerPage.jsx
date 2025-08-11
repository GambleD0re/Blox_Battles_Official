import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';

const Loader = () => (
    <div className="flex items-center justify-center p-12">
        <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
    </div>
);

const TicketTranscriptViewerPage = () => {
    const { ticketId } = useParams();
    const [transcript, setTranscript] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        const fetchTranscript = async () => {
            try {
                const response = await fetch(`${API_BASE_URL}/api/transcripts/ticket/${ticketId}`);
                const data = await response.text();
                if (!response.ok) {
                    try {
                        const jsonData = JSON.parse(data);
                        throw new Error(jsonData.message || `Error: ${response.status}`);
                    } catch (e) {
                         throw new Error(`Error: ${response.status} - Could not retrieve transcript.`);
                    }
                }
                setTranscript(data);
            } catch (err) {
                setError(err.message);
            } finally {
                setIsLoading(false);
            }
        };
        fetchTranscript();
    }, [ticketId]);

    return (
        <div className="min-h-screen bg-gray-900 text-white p-4 sm:p-6 lg:p-8">
            <div className="max-w-7xl mx-auto">
                <header className="flex justify-between items-center mb-6 pb-4 border-b border-gray-700">
                    <div>
                        <h1 className="text-3xl font-bold">Ticket Transcript</h1>
                        <p className="text-gray-500">ID: {ticketId}</p>
                    </div>
                    <Link to="/dashboard" className="btn btn-secondary !mt-0">Back to Blox Battles</Link>
                </header>

                {isLoading && <Loader />}
                {error && <div className="p-4 text-center bg-red-900/50 text-red-300 rounded-lg">{error}</div>}
                {transcript && (
                    <div className="widget">
                        <div className="p-4 bg-black rounded-lg font-mono max-h-[70vh] overflow-y-auto">
                            <pre className="whitespace-pre-wrap break-words text-sm text-gray-300">
                                {transcript}
                            </pre>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default TicketTranscriptViewerPage;
