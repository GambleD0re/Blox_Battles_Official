import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import * as api from '../services/api';

// --- Reusable Helper Components for this page ---

const Loader = () => (
    <div className="flex items-center justify-center p-8">
        <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
    </div>
);

const TransactionRow = ({ transaction }) => {
    const isCredit = transaction.amount_gems > 0;
    const amountColor = isCredit ? 'text-green-400' : 'text-red-400';
    const amountSign = isCredit ? '+' : '';

    const typeStyles = {
        'deposit_stripe': 'bg-blue-800 text-blue-200',
        'deposit_crypto': 'bg-purple-800 text-purple-200',
        'withdrawal': 'bg-yellow-800 text-yellow-200',
        'duel_wager': 'bg-red-800 text-red-200',
        'duel_win': 'bg-green-800 text-green-200',
        'admin_adjustment': 'bg-gray-600 text-gray-200',
    };

    const typeStyle = typeStyles[transaction.type] || 'bg-gray-700';
    const formattedType = transaction.type.replace('_', ' ').toUpperCase();

    return (
        <tr className="border-b border-gray-800 hover:bg-gray-800/50">
            <td className="p-4 text-gray-400">
                {new Date(transaction.created_at).toLocaleString()}
            </td>
            <td className="p-4">
                <span className={`px-2 py-1 text-xs font-semibold rounded-full ${typeStyle}`}>
                    {formattedType}
                </span>
            </td>
            <td className="p-4 text-gray-200">
                {transaction.description}
            </td>
            <td className={`p-4 font-bold text-right font-mono ${amountColor}`}>
                {amountSign}{transaction.amount_gems.toLocaleString()}
            </td>
        </tr>
    );
};


// --- Main Transaction History Page Component ---
const TransactionHistoryPage = () => {
    const { token } = useAuth();
    const navigate = useNavigate();
    const [history, setHistory] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        const fetchHistory = async () => {
            if (!token) return;
            try {
                const data = await api.getTransactionHistory(token);
                setHistory(data);
            } catch (err) {
                setError(err.message || 'Failed to fetch transaction history.');
            } finally {
                setIsLoading(false);
            }
        };

        fetchHistory();
    }, [token]);

    return (
        <div className="max-w-5xl mx-auto p-4 sm:p-6 lg:p-8">
            <header className="flex justify-between items-center mb-8">
                <h1 className="text-4xl font-bold text-white">Transaction History</h1>
                <button onClick={() => navigate('/settings')} className="btn btn-secondary !mt-0">Back to Settings</button>
            </header>

            <div className="widget">
                {error && <div className="p-4 mb-4 text-center bg-red-900/50 text-red-300 rounded-lg">{error}</div>}
                
                <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="text-left text-xs text-gray-400 uppercase border-b border-gray-700">
                                <th className="p-4">Date</th>
                                <th className="p-4">Type</th>
                                <th className="p-4">Description</th>
                                <th className="p-4 text-right">Amount (Gems)</th>
                            </tr>
                        </thead>
                        <tbody>
                            {isLoading ? (
                                <tr><td colSpan="4"><Loader /></td></tr>
                            ) : history.length > 0 ? (
                                history.map(tx => <TransactionRow key={tx.id} transaction={tx} />)
                            ) : (
                                <tr><td colSpan="4" className="p-8 text-center text-gray-500">No transactions found.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default TransactionHistoryPage;