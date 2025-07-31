import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import * as api from '../services/api';

// --- Helper & Icon Components ---
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

const CryptoTokenIcon = ({ mainSrc, networkSrc, alt }) => (
    <div className="relative w-10 h-10 shrink-0">
        <img src={mainSrc} alt={alt} className="w-8 h-8 rounded-full object-cover min-w-[2rem]" />
        {networkSrc && (
            <div className="flex items-center justify-center w-4 h-4 rounded-full object-cover overflow-hidden absolute ring-1 ring-[#010409] -top-1 -right-1">
                <img src={networkSrc} alt="Polygon Network" className="rounded-full" />
            </div>
        )}
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
        {
            symbol: 'USDC',
            name: 'USDCoin',
            network: 'Polygon Mainnet',
            mainSrc: 'https://static.cx.metamask.io/api/v1/tokenIcons/137/0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174.png',
            networkSrc: 'https://static.cx.metamask.io/api/v1/tokenIcons/137/0x0000000000000000000000000000000000000000.png'
        },
        {
            symbol: 'USDT',
            name: 'Tether USD',
            network: 'Polygon Mainnet',
            mainSrc: 'https://static.cx.metamask.io/api/v1/tokenIcons/137/0xc2132d05d31c914a87c6611c10748aeb04b58e8f.png',
            networkSrc: 'https://static.cx.metamask.io/api/v1/tokenIcons/137/0x0000000000000000000000000000000000000000.png'
        }
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
                <div className="widget text-center"><p className="text-sm text-gray-400">Current Balance</p><p className="text-3xl font-bold text-cyan-400">{user?.gems.toLocaleString() || 0} Gems</p></div>
                <div className="widget text-center"><p className="text-sm text-gray-400">Conversion Rate</p><p className="text-lg font-semibold text-white">110 Gems = $1.00 USD</p></div>
                <div className="widget text-center"><p className="text-sm text-gray-400">Withdrawable Value</p><p className="text-3xl font-bold text-green-400">${((user?.gems || 0) / GEM_TO_USD_CONVERSION_RATE).toFixed(2)}</p></div>
            </div>

            <div>
                <InfoCard title="Request Crypto Withdrawal">
                    <p>Withdraw your gems as USDC or USDT on the Polygon network. Ensure your wallet address is correct and supports Polygon to avoid loss of funds.</p>
                    <p className="font-bold text-yellow-400">Warning: Transactions on the blockchain are irreversible. Double-check your address before submitting.</p>
                </InfoCard>
                <form onSubmit={handleCryptoWithdrawalSubmit} className="mt-6 widget">
                    <div className="form-group">
                        <label className="text-gray-300">Select Currency</label>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {supportedWithdrawalTokens.map(tokenItem => (
                                <label key={tokenItem.symbol} className={`p-3 rounded-lg border-2 flex items-center justify-between transition-all cursor-pointer ${selectedToken === tokenItem.symbol ? 'border-cyan-400 bg-cyan-500/10' : 'border-gray-700 bg-gray-800/50 hover:border-gray-600'}`}>
                                    <div className="flex items-center gap-3">
                                        <input type="radio" name="tokenType" value={tokenItem.symbol} checked={selectedToken === tokenItem.symbol} onChange={() => setSelectedToken(tokenItem.symbol)} className="hidden"/>
                                        <CryptoTokenIcon mainSrc={tokenItem.mainSrc} networkSrc={tokenItem.networkSrc} alt={tokenItem.name} />
                                        <div>
                                            <p className="font-bold text-left text-white">{tokenItem.symbol}</p>
                                            <p className="text-xs text-left text-gray-400">{tokenItem.name}</p>
                                        </div>
                                    </div>
                                    <span className="bg-gray-700/50 text-gray-300 text-xs font-semibold px-2.5 py-1 rounded-full">POLYGON</span>
                                </label>
                            ))}
                        </div>
                    </div>
                     <div className="form-group"><label htmlFor="recipient-address" className="text-gray-300">Your Polygon Wallet Address</label><input id="recipient-address" type="text" value={recipientAddress} onChange={(e) => setRecipientAddress(e.target.value)} placeholder="0x..." required className="form-input font-mono"/></div>
                    <div className="form-group"><label htmlFor="gem-amount-crypto" className="text-gray-300">Gems to Withdraw</label><div className="flex items-center gap-4"><input id="gem-amount-crypto" type="number" value={cryptoGemAmount} onChange={(e) => setCryptoGemAmount(e.target.value)} placeholder={`e.g., ${MINIMUM_GEM_WITHDRAWAL}`} min={MINIMUM_GEM_WITHDRAWAL} max={user.gems} required className="form-input flex-grow"/><div className="text-lg font-semibold text-gray-400">=</div><div className="text-2xl font-bold text-green-400">${usdValue}</div></div><p className="text-xs text-gray-500 mt-1">Minimum withdrawal: {MINIMUM_GEM_WITHDRAWAL.toLocaleString()} gems.</p></div>
                    <div className="text-right"><button type="submit" className="btn btn-primary" disabled={!isAmountValid || !isAddressValid || isSubmitting}>{isSubmitting ? <Loader inline={true} /> : `Request ${selectedToken} Withdrawal`}</button></div>
                </form>
            </div>
        </div>
    );
};

export default WithdrawPage;
