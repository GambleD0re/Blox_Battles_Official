import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import * as api from '../services/api';

// --- Reusable Helper Components for this page ---

const Loader = ({ inline = false }) => (
    <div className={`flex items-center justify-center ${inline ? '' : 'p-8'}`}>
        <div className="w-6 h-6 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
    </div>
);

const InfoCard = ({ title, children }) => (
    <div className="bg-gray-800/50 border border-gray-700 p-6 rounded-lg">
        <h3 className="font-bold text-lg text-white mb-2">{title}</h3>
        <div className="text-gray-400 text-sm space-y-2">{children}</div>
    </div>
);

// --- Main Withdraw Page Component ---
const WithdrawPage = () => {
    const { user, token, refreshUser } = useAuth();
    const navigate = useNavigate();

    const [isSubmitting, setIsSubmitting] = useState(false);
    const [message, setMessage] = useState({ text: '', type: '' });

    const [cryptoGemAmount, setCryptoGemAmount] = useState('');
    const [recipientAddress, setRecipientAddress] = useState('');
    const [selectedToken, setSelectedToken] = useState('USDC');

    const GEM_TO_USD_CONVERSION_RATE = 110;
    const MINIMUM_GEM_WITHDRAWAL = 11;

    const supportedWithdrawalTokens = [
        { symbol: 'USDC', name: 'USD Coin', network: 'Polygon' },
        { symbol: 'USDT', name: 'Tether', network: 'Polygon' }
    ];

    const handleCryptoWithdrawalSubmit = async (e) => {
        e.preventDefault();
        setIsSubmitting(true);
        setMessage({ text: '', type: '' });
        try {
            const result = await api.requestCryptoWithdrawal(parseInt(cryptoGemAmount, 10), recipientAddress, selectedToken, token);
            setMessage({ text: `${result.message}`, type: 'success' });
            setCryptoGemAmount('');
            setRecipientAddress('');
            refreshUser();
        } catch (error) {
            setMessage({ text: error.message, type: 'error' });
        } finally {
            setIsSubmitting(false);
        }
    };

    const usdValue = cryptoGemAmount ? (parseInt(cryptoGemAmount, 10) / GEM_TO_USD_CONVERSION_RATE).toFixed(2) : '0.00';
    const isAmountValid = cryptoGemAmount && parseInt(cryptoGemAmount, 10) >= MINIMUM_GEM_WITHDRAWAL && parseInt(cryptoGemAmount, 10) <= user.gems;
    const isAddressValid = /^0x[a-fA-F0-9]{40}$/.test(recipientAddress);

    return (
        <div className="max-w-4xl mx-auto p-4 sm:p-6 lg:p-8">
            {message.text && (
                <div className={`mb-6 p-4 rounded-lg text-white font-bold shadow-lg break-words ${message.type === 'success' ? 'bg-green-500' : 'bg-red-500'}`}>
                    {message.text}
                </div>
            )}
            
            <header className="flex justify-between items-center mb-8">
                <h1 className="text-4xl font-bold text-white">Withdraw Gems</h1>
                <button onClick={() => navigate('/dashboard')} className="btn btn-secondary !mt-0">Back to Dashboard</button>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                <div className="widget text-center">
                    <p className="text-sm text-gray-400">Current Balance</p>
                    <p className="text-3xl font-bold text-cyan-400">{user?.gems.toLocaleString() || 0} Gems</p>
                </div>
                <div className="widget text-center">
                    <p className="text-sm text-gray-400">Conversion Rate</p>
                    <p className="text-lg font-semibold text-white">110 Gems = $1.00 USD</p>
                </div>
                <div className="widget text-center">
                    <p className="text-sm text-gray-400">Withdrawable Value</p>
                    <p className="text-3xl font-bold text-green-400">${((user?.gems || 0) / GEM_TO_USD_CONVERSION_RATE).toFixed(2)}</p>
                </div>
            </div>

            {/* [MODIFIED] The tab system has been completely removed. */}
            <div>
                <InfoCard title="Request Crypto Withdrawal">
                    <p>Withdraw your gems as USDC or USDT on the Polygon network. Ensure your wallet address is correct and supports Polygon to avoid loss of funds.</p>
                    <p className="font-bold text-yellow-400">Warning: Transactions on the blockchain are irreversible. Double-check your address before submitting.</p>
                </InfoCard>
                <form onSubmit={handleCryptoWithdrawalSubmit} className="mt-6 widget">
                     <div className="form-group">
                        <label className="text-gray-300">Select Currency</label>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {supportedWithdrawalTokens.map(token => (
                                <label key={token.symbol} className={`p-4 rounded-lg border-2 transition-all cursor-pointer flex items-center justify-center text-center transform hover:scale-105 hover:shadow-2xl ${selectedToken === token.symbol ? 'border-cyan-400 bg-cyan-500/20 shadow-lg shadow-cyan-500/20' : 'border-gray-700 bg-gray-800/50'}`}>
                                    <input
                                        type="radio"
                                        name="tokenType"
                                        value={token.symbol}
                                        checked={selectedToken === token.symbol}
                                        onChange={() => setSelectedToken(token.symbol)}
                                        className="hidden"
                                    />
                                    <span className={`text-2xl font-extrabold tracking-widest transition-colors ${selectedToken === token.symbol ? 'bg-gradient-to-r from-cyan-300 to-blue-400 bg-clip-text text-transparent' : 'text-gray-500'}`}>
                                        {token.symbol}
                                    </span>
                                </label>
                            ))}
                        </div>
                    </div>
                     <div className="form-group">
                        <label htmlFor="recipient-address" className="text-gray-300">Your Polygon Wallet Address</label>
                        <input id="recipient-address" type="text" value={recipientAddress} onChange={(e) => setRecipientAddress(e.target.value)} placeholder="0x..." required className="form-input font-mono"/>
                    </div>
                    <div className="form-group">
                        <label htmlFor="gem-amount-crypto" className="text-gray-300">Gems to Withdraw</label>
                        <div className="flex items-center gap-4">
                            <input id="gem-amount-crypto" type="number" value={cryptoGemAmount} onChange={(e) => setCryptoGemAmount(e.target.value)} placeholder={`e.g., ${MINIMUM_GEM_WITHDRAWAL}`} min={MINIMUM_GEM_WITHDRAWAL} max={user.gems} required className="form-input flex-grow"/>
                            <div className="text-lg font-semibold text-gray-400">=</div>
                            <div className="text-2xl font-bold text-green-400">${usdValue}</div>
                        </div>
                        <p className="text-xs text-gray-500 mt-1">Minimum withdrawal: {MINIMUM_GEM_WITHDRAWAL.toLocaleString()} gems.</p>
                    </div>
                    <div className="text-right">
                        <button type="submit" className="btn btn-primary" disabled={!isAmountValid || !isAddressValid || isSubmitting}>
                            {isSubmitting ? <Loader inline={true} /> : `Request ${selectedToken} Withdrawal`}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default WithdrawPage;