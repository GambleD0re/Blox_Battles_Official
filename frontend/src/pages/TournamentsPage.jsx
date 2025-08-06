import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import * as api from '../services/api';
import TournamentDetailModal from '../components/Dashboard/TournamentDetailModal'; // [NEW] Import the modal

const Loader = () => (
    <div className="flex items-center justify-center p-8">
        <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
    </div>
);

const TournamentRow = ({ tournament, onView }) => { // [MODIFIED] Pass onView handler
    const getStatusStyles = (status) => {
        switch (status) {
            case 'registration_open': return 'bg-green-800 text-green-200';
            case 'active': return 'bg-yellow-800 text-yellow-200';
            case 'completed':
            case 'finalized': return 'bg-blue-800 text-blue-200';
            default: return 'bg-gray-700 text-gray-300';
        }
    };

    const formatStartTime = (dateString) => {
        const date = new Date(dateString);
        return date.toLocaleString(undefined, {
            dateStyle: 'medium',
            timeStyle: 'short',
        });
    };

    return (
        <tr className="border-b border-gray-800 hover:bg-gray-800/50">
            <td className="p-4">
                <p className="font-bold text-white">{tournament.name}</p>
                <p className="text-sm text-gray-400">{formatStartTime(tournament.starts_at)}</p>
            </td>
            <td className="p-4 text-center">{tournament.region}</td>
            <td className="p-4 text-center font-mono text-cyan-400">{tournament.buy_in_amount.toLocaleString()}</td>
            <td className="p-4 text-center">{`${tournament.registered_players} / ${tournament.capacity}`}</td>
            <td className="p-4 text-center">
                <span className={`px-2 py-1 text-xs font-semibold rounded-full ${getStatusStyles(tournament.status)}`}>
                    {tournament.status.replace('_', ' ').toUpperCase()}
                </span>
            </td>
            <td className="p-4 text-right">
                <button 
                    onClick={() => onView(tournament.id)} 
                    className="btn btn-secondary !mt-0 !py-2 !px-4"
                >
                    View
                </button>
            </td>
        </tr>
    );
};

const TournamentsPage = () => {
    const { token, refreshUser } = useAuth(); // [NEW] Get refreshUser from auth context
    const navigate = useNavigate();
    const [tournaments, setTournaments] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');
    
    // [NEW] State for the modal
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [selectedTournament, setSelectedTournament] = useState(null);
    const [message, setMessage] = useState({ text: '', type: '' });

    const fetchTournaments = async () => {
        if (!token) return;
        setIsLoading(true);
        try {
            const data = await api.getTournaments(token);
            setTournaments(data);
        } catch (err) {
            setError(err.message || 'Failed to fetch tournaments.');
        } finally {
            setIsLoading(false);
        }
    };
    
    useEffect(() => {
        fetchTournaments();
    }, [token]);

    const handleViewDetails = async (id) => {
        try {
            const details = await api.getTournamentDetails(id, token);
            // We need to merge the player count from the list view, as the detail view doesn't have it.
            const listVersion = tournaments.find(t => t.id === id);
            setSelectedTournament({ ...details, registered_players: listVersion?.registered_players || 0 });
            setIsModalOpen(true);
        } catch (err) {
             setMessage({ text: err.message, type: 'error' });
        }
    };
    
    const handleRegister = async (tournament) => {
        if (window.confirm(`Are you sure you want to register for "${tournament.name}"? ${tournament.buy_in_amount} gems will be deducted from your balance.`)) {
            try {
                const result = await api.registerForTournament(tournament.id, token);
                setMessage({ text: result.message, type: 'success' });
                setIsModalOpen(false);
                refreshUser(); // Update user's gem balance
                fetchTournaments(); // Refresh the tournament list to show updated player count
            } catch (err) {
                 setMessage({ text: err.message, type: 'error' });
            }
        }
    };

    return (
        <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
             {message.text && <div className={`fixed top-5 right-5 p-4 rounded-lg text-white font-bold shadow-lg z-[60] ${message.type === 'success' ? 'bg-green-500' : 'bg-red-500'}`}>{message.text}</div>}
            <header className="flex justify-between items-center mb-8">
                <h1 className="text-4xl font-bold text-white">Tournaments</h1>
                <button onClick={() => navigate('/dashboard')} className="btn btn-secondary !mt-0">Back to Dashboard</button>
            </header>

            <div className="widget">
                {error && <div className="p-4 mb-4 text-center bg-red-900/50 text-red-300 rounded-lg">{error}</div>}
                
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="text-left text-xs text-gray-400 uppercase border-b border-gray-700">
                                <th className="p-4">Event</th>
                                <th className="p-4 text-center">Region</th>
                                <th className="p-4 text-center">Buy-in (Gems)</th>
                                <th className="p-4 text-center">Players</th>
                                <th className="p-4 text-center">Status</th>
                                <th className="p-4"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {isLoading ? (
                                <tr><td colSpan="6"><Loader /></td></tr>
                            ) : tournaments.length > 0 ? (
                                tournaments.map(t => <TournamentRow key={t.id} tournament={t} onView={handleViewDetails} />)
                            ) : (
                                <tr><td colSpan="6" className="p-8 text-center text-gray-500">No tournaments found.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            <TournamentDetailModal 
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                tournament={selectedTournament}
                onRegister={handleRegister}
            />
        </div>
    );
};

export default TournamentsPage;
