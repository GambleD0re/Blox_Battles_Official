import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import * as api from '../services/api';
import { loadStripe } from '@stripe/stripe-js';

// --- Configuration & Initialization ---
const STRIPE_PUBLISHABLE_KEY = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;
const stripePromise = STRIPE_PUBLISHABLE_KEY ? loadStripe(STRIPE_PUBLISHABLE_KEY) : null;
const USD_TO_GEMS_RATE = 100;
const MINIMUM_USD_DEPOSIT = 4.00;

// --- Helper Components ---
const GemIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-cyan-400"><path d="M6 3h12l4 6-10 13L2 9Z"></path><path d="M12 22V9"></path><path d="m3.29 9 8.71 13 8.71-13"></path></svg>;
const TabButton = ({ active, onClick, children }) => (
    <button onClick={onClick} className={`px-4 py-2 font-semibold rounded-t-lg border-b-2 transition-colors ${active ? 'border-cyan-400 text-cyan-400' : 'border-transparent text-gray-400 hover:text-white hover:border-gray-500'}`}>
        {children}
    </button>
);
const QRCode = ({ address }) => {
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=128x128&data=${address}`;
    return <img src={qrUrl} alt="Deposit Address QR Code" className="rounded-lg border-4 border-white mx-auto" />;
};


// --- Main Deposit Page Component ---
const DepositPage = () => {
    const { token, refreshUser } = useAuth();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();

    const [message, setMessage] = useState({ text: '', type: '' });
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [activeTab, setActiveTab] = useState('card');

    // [NEW] State for custom amount input
    const [amountUSD, setAmountUSD] = useState(MINIMUM_USD_DEPOSIT.toFixed(2));
    const [gemAmount, setGemAmount] = useState(MINIMUM_USD_DEPOSIT * USD_TO_GEMS_RATE);

    // State for Crypto Deposits
    const [cryptoAddress, setCryptoAddress] = useState('');
    const [selectedCrypto, setSelectedCrypto] = useState('USDC');
    const [quote, setQuote] = useState(null);
    const [isQuoteLoading, setIsQuoteLoading] = useState(false);

    // Effect for handling Stripe redirects
    useEffect(() => {
        if (searchParams.get('success')) {
            setMessage({ text: 'Purchase successful! Your gems have been added.', type: 'success' });
            refreshUser();
            navigate('/deposit', { replace: true });
        }
        if (searchParams.get('canceled')) {
            setMessage({ text: 'Purchase canceled. You have not been charged.', type: 'error' });
            navigate('/deposit', { replace: true });
        }
    }, [searchParams, refreshUser, navigate]);

    const fetchCryptoAddress = useCallback(async () => {
        if (token) {
            try {
                const data = await api.getCryptoDepositAddress(token);
                setCryptoAddress(data.address);
            } catch (error) {
                setMessage({ text: 'Could not fetch your crypto deposit address.', type: 'error' });
            }
        }
    }, [token]);

    useEffect(() => {
        if (activeTab === 'crypto') {
            fetchCryptoAddress();
        }
    }, [activeTab, fetchCryptoAddress]);

    // [NEW] Handler for custom amount input change
    const handleAmountChange = (e) => {
        const value = e.target.value;
        setAmountUSD(value);
        if (!isNaN(value) && parseFloat(value) > 0) {
            setGemAmount(Math.floor(parseFloat(value) * USD_TO_GEMS_RATE));
        } else {
            setGemAmount(0);
        }
    };

    const handleStripePurchase = async () => {
        if (!stripePromise) {
             setMessage({ text: 'Payment system is currently unavailable.', type: 'error' });
             return;
        }
        if (parseFloat(amountUSD) < MINIMUM_USD_DEPOSIT) {
            setMessage({ text: `Minimum deposit is $${MINIMUM_USD_DEPOSIT.toFixed(2)}.`, type: 'error' });
            return;
        }
        setIsSubmitting(true);
        setMessage({ text: '', type: '' });
        try {
            // [MODIFIED] Pass the custom amount to the API
            const { id: sessionId } = await api.createCheckoutSession(parseFloat(amountUSD), token);
            const stripe = await stripePromise;
            const { error } = await stripe.redirectToCheckout({ sessionId });
            if (error) {
                setMessage({ text: error.message, type: 'error' });
            }
        } catch (err) {
            setMessage({ text: err.message, type: 'error' });
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleGetQuote = async () => {
        if (parseFloat(amountUSD) < MINIMUM_USD_DEPOSIT) {
            setMessage({ text: `Minimum deposit is $${MINIMUM_USD_DEPOSIT.toFixed(2)}.`, type: 'error' });
            return;
        }
        setIsQuoteLoading(true);
        setQuote(null);
        setMessage({ text: '', type: '' });
        try {
            // [MODIFIED] Pass the custom amount to the API
            const quoteData = await api.getCryptoQuote(parseFloat(amountUSD), selectedCrypto, token);
            setQuote(quoteData);
        } catch (error) {
            setMessage({ text: error.message, type: 'error' });
        } finally {
            setIsQuoteLoading(false);
        }
    };

    const renderCardContent = () => (
        <div className="widget max-w-lg mx-auto">
            <h3 className="widget-title">Purchase with Card</h3>
            <div className="space-y-6 p-4">
                <div className="form-group">
                    <label htmlFor="amount-input" className="block text-sm font-medium text-gray-400 mb-1">Enter Amount (USD)</label>
                    <div className="flex items-center gap-2">
                        <span className="text-gray-400 text-2xl">$</span>
                        <input
                            id="amount-input"
                            type="number"
                            value={amountUSD}
                            onChange={handleAmountChange}
                            step="0.01"
                            min={MINIMUM_USD_DEPOSIT}
                            className="form-input !text-3xl !font-bold !p-2 flex-grow"
                            placeholder={MINIMUM_USD_DEPOSIT.toFixed(2)}
                        />
                    </div>
                    <p className="text-xs text-gray-500 mt-1">Minimum deposit: ${MINIMUM_USD_DEPOSIT.toFixed(2)}</p>
                </div>
                <div className="text-center p-4 bg-gray-900/50 rounded-lg">
                    <p className="text-sm text-gray-400">You will receive:</p>
                    <p className="text-4xl font-black text-cyan-400">{gemAmount.toLocaleString()}</p>
                    <p className="text-cyan-400">Gems</p>
                </div>
                <button onClick={handleStripePurchase} disabled={isSubmitting || !stripePromise || parseFloat(amountUSD) < MINIMUM_USD_DEPOSIT} className="btn btn-primary w-full mt-4 disabled:bg-gray-500 disabled:cursor-not-allowed">
                    {isSubmitting ? 'Processing...' : `Purchase for $${parseFloat(amountUSD).toFixed(2)}`}
                </button>
            </div>
        </div>
    );

    const renderCryptoContent = () => {
        return (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-1 space-y-4">
                    <div className="widget !p-4">
                        <label className="block text-sm font-medium text-gray-400 mb-2">1. Select Currency</label>
                        <div className="flex gap-2">
                            {['USDC', 'USDT', 'POL'].map(tokenType => (
                                <button key={tokenType} onClick={() => setSelectedCrypto(tokenType)} className={`flex-1 p-2 rounded-md border-2 font-semibold transition-all ${selectedCrypto === tokenType ? 'border-cyan-400 bg-cyan-500/10' : 'border-gray-700 bg-gray-800/50 hover:border-gray-600'}`}>
                                    {tokenType}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div className="widget !p-4">
                         <label htmlFor="crypto-amount-input" className="block text-sm font-medium text-gray-400 mb-2">2. Enter Amount (USD)</label>
                         <div className="flex items-center gap-2">
                            <span className="text-gray-400 text-lg">$</span>
                            <input
                                id="crypto-amount-input"
                                type="number"
                                value={amountUSD}
                                onChange={handleAmountChange}
                                step="0.01"
                                min={MINIMUM_USD_DEPOSIT}
                                className="form-input !text-xl !font-bold !p-2 flex-grow"
                                placeholder={MINIMUM_USD_DEPOSIT.toFixed(2)}
                            />
                        </div>
                        <p className="text-xs text-gray-500 mt-1">Minimum: ${MINIMUM_USD_DEPOSIT.toFixed(2)}</p>
                        <button onClick={handleGetQuote} disabled={isQuoteLoading || parseFloat(amountUSD) < MINIMUM_USD_DEPOSIT} className="btn btn-primary w-full mt-4">
                            {isQuoteLoading ? 'Getting Quote...' : 'Get Deposit Quote'}
                        </button>
                    </div>
                </div>
                <div className="lg:col-span-2 widget">
                    <h3 className="widget-title">3. Send Your Deposit</h3>
                    {!quote && !isQuoteLoading && (
                        <div className="text-center text-gray-500 py-12">
                            <p>Select a currency and enter a deposit amount to generate instructions.</p>
                        </div>
                    )}
                    {isQuoteLoading && <div className="flex justify-center py-12"><div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div></div>}
                    {quote && (
                        <div className="space-y-4 text-center">
                            <p className="text-gray-400">To purchase <strong>{quote.gemAmount.toLocaleString()} Gems</strong>, send the exact amount below to your unique deposit address.</p>
                            
                            <div className="bg-gray-900 p-4 rounded-lg">
                                <p className="text-sm text-cyan-400">Send exactly:</p>
                                <p className="text-2xl font-bold text-white tracking-wider">{quote.cryptoAmount} {quote.tokenType}</p>
                            </div>

                            <div className="bg-gray-900 p-4 rounded-lg">
                                <p className="text-sm text-cyan-400">To your Polygon address:</p>
                                <p className="text-sm font-mono text-white break-all my-2">{cryptoAddress}</p>
                                {cryptoAddress && <QRCode address={cryptoAddress} />}
                            </div>
                            <div className="text-xs text-yellow-400">This quote is valid for 15 minutes. Do not send funds after the quote has expired. Your gems will be credited after the transaction is confirmed on the blockchain.</div>
                        </div>
                    )}
                </div>
            </div>
        );
    }

    return (
        <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
            {message.text && <div className={`mb-6 p-4 rounded-lg text-white font-bold shadow-lg ${message.type === 'success' ? 'bg-green-500' : 'bg-red-500'}`}>{message.text}</div>}
            
            <header className="flex justify-between items-center mb-8">
                <h1 className="text-4xl font-bold text-white">Deposit Gems</h1>
                <button onClick={() => navigate('/dashboard')} className="btn btn-secondary !mt-0">Back to Dashboard</button>
            </header>

            <div className="border-b border-gray-700 mb-6">
                <TabButton active={activeTab === 'card'} onClick={() => setActiveTab('card')}>Credit Card</TabButton>
                <TabButton active={activeTab === 'crypto'} onClick={() => setActiveTab('crypto')}>Crypto</TabButton>
            </div>

            {activeTab === 'card' && renderCardContent()}
            {activeTab === 'crypto' && renderCryptoContent()}
        </div>
    );
};

export default DepositPage;
