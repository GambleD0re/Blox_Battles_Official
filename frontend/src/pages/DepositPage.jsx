import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import * as api from '../services/api';
import { loadStripe } from '@stripe/stripe-js';

// --- Configuration & Initialization ---
const STRIPE_PUBLISHABLE_KEY = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;
const stripePromise = STRIPE_PUBLISHABLE_KEY ? loadStripe(STRIPE_PUBLISHABLE_KEY) : null;

// --- Helper Components ---
const GemIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-fuchsia-400"><path d="M6 3h12l4 6-10 13L2 9Z"></path><path d="M12 22V9"></path><path d="m3.29 9 8.71 13 8.71-13"></path></svg>;
const TabButton = ({ active, onClick, children }) => (
    <button onClick={onClick} className={`px-4 py-2 font-semibold rounded-t-lg border-b-2 transition-colors ${active ? 'border-fuchsia-500 text-fuchsia-400' : 'border-transparent text-gray-400 hover:text-white hover:border-gray-500'}`}>
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
    const [loadingPackage, setLoadingPackage] = useState(null);
    const [activeTab, setActiveTab] = useState('card');

    const [cryptoAddress, setCryptoAddress] = useState('');
    const [selectedCrypto, setSelectedCrypto] = useState('USDC');
    const [quote, setQuote] = useState(null);
    const [isQuoteLoading, setIsQuoteLoading] = useState(false);

    const packages = [
        { id: '500_gems', gems: 500, price: 5.00, name: "500 Gems", description: "Small Gem pack"},
        { id: '1000_gems', gems: 1000, price: 10.00, name: "1,000 Gems", description: "Standard Gem pack", bestValue: true },
        { id: '1500_gems', gems: 1500, price: 15.00, name: "1,500 Gems", description: "Good Value pack" },
        { id: '2500_gems', gems: 2500, price: 25.00, name: "2,500 Gems", description: "Large Gem pack" },
        { id: '5000_gems', gems: 5000, price: 50.00, name: "5,000 Gems", description: "Super Gem pack" },
        { id: '10000_gems', gems: 10000, price: 100.00, name: "10,000 Gems", description: "Mega Gem pack" },
    ];

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


    const handleStripePurchase = async (packageId) => {
        if (!stripePromise) {
             setMessage({ text: 'Payment system is currently unavailable.', type: 'error' });
             return;
        }
        setLoadingPackage(packageId);
        setMessage({ text: '', type: '' });
        try {
            const { id: sessionId } = await api.createCheckoutSession(packageId, token);
            const stripe = await stripePromise;
            const { error } = await stripe.redirectToCheckout({ sessionId });
            if (error) {
                setMessage({ text: error.message, type: 'error' });
            }
        } catch (err) {
            setMessage({ text: err.message, type: 'error' });
        } finally {
            setLoadingPackage(null);
        }
    };

    const handleGetQuote = async (packageId) => {
        setIsQuoteLoading(true);
        setQuote(null);
        setMessage({ text: '', type: '' });
        try {
            const quoteData = await api.getCryptoQuote(packageId, selectedCrypto, token);
            setQuote(quoteData);
        } catch (error) {
            setMessage({ text: error.message, type: 'error' });
        } finally {
            setIsQuoteLoading(false);
        }
    };

    const renderCardContent = () => (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {packages.map((pkg) => (
                <div key={pkg.id} className={`widget text-center flex flex-col relative ${pkg.bestValue ? 'border-2 border-fuchsia-500 shadow-fuchsia-500/20 shadow-2xl' : ''}`}>
                    {pkg.bestValue && <div className="bg-fuchsia-500 text-black font-bold text-xs py-1 px-3 rounded-full absolute -top-3 left-1/2 -translate-x-1/2">Most Popular</div>}
                    <div className="flex-grow">
                        <GemIcon />
                        <h3 className="text-3xl font-bold text-white mt-2">{pkg.gems.toLocaleString()}</h3>
                        <p className="text-fuchsia-400">Gems</p>
                        <p className="text-gray-400 text-sm mt-4">{pkg.description}</p>
                    </div>
                    <div className="mt-6">
                        <p className="text-4xl font-black text-white">${pkg.price.toFixed(2)}</p>
                        <button onClick={() => handleStripePurchase(pkg.id)} disabled={loadingPackage === pkg.id || !stripePromise} className="btn btn-primary w-full mt-4 disabled:bg-gray-500 disabled:cursor-not-allowed">
                            {loadingPackage === pkg.id ? 'Processing...' : 'Purchase'}
                        </button>
                    </div>
                </div>
            ))}
        </div>
    );

    const renderCryptoContent = () => {
        const selectedPackageForQuote = quote ? packages.find(p => p.id === quote.packageId) : null;

        return (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-1 space-y-4">
                    <div className="widget !p-4">
                        <label className="block text-sm font-medium text-gray-400 mb-2">1. Select Currency</label>
                        <div className="flex gap-2">
                            {['USDC', 'USDT', 'POL'].map(tokenType => (
                                <button key={tokenType} onClick={() => setSelectedCrypto(tokenType)} className={`flex-1 p-2 rounded-md border-2 font-semibold transition-all ${selectedCrypto === tokenType ? 'border-fuchsia-500 bg-fuchsia-500/10' : 'border-gray-700 bg-gray-800/50 hover:border-gray-600'}`}>
                                    {tokenType}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div className="widget !p-4">
                         <label className="block text-sm font-medium text-gray-400 mb-2">2. Choose Package to Get Quote</label>
                        {packages.map((pkg) => (
                            <button key={pkg.id} onClick={() => handleGetQuote(pkg.id)} disabled={isQuoteLoading} className="w-full text-left p-3 mb-2 bg-gray-800/50 rounded-lg border-2 border-gray-700 hover:border-fuchsia-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                                <p className="font-bold text-white">{pkg.name}</p>
                                <p className="text-sm text-gray-400">${pkg.price.toFixed(2)}</p>
                            </button>
                        ))}
                    </div>
                </div>
                <div className="lg:col-span-2 widget">
                    <h3 className="widget-title">3. Send Your Deposit</h3>
                    {!quote && !isQuoteLoading && (
                        <div className="text-center text-gray-500 py-12">
                            <p>Select a currency and a gem package to generate deposit instructions.</p>
                        </div>
                    )}
                    {isQuoteLoading && <div className="flex justify-center py-12"><div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div></div>}
                    {quote && selectedPackageForQuote && (
                        <div className="space-y-4 text-center">
                            <p className="text-gray-400">To purchase <strong>{selectedPackageForQuote.name}</strong>, send the exact amount below to your unique deposit address.</p>
                            
                            <div className="bg-gray-900 p-4 rounded-lg">
                                <p className="text-sm text-fuchsia-400">Send exactly:</p>
                                <p className="text-2xl font-bold text-white tracking-wider">{quote.cryptoAmount} {quote.tokenType}</p>
                            </div>

                            <div className="bg-gray-900 p-4 rounded-lg">
                                <p className="text-sm text-fuchsia-400">To your Polygon address:</p>
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
