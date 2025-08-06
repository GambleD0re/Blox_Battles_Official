import React from 'react';

const Modal = ({ children, isOpen, onClose, title }) => {
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 bg-black bg-opacity-80 flex items-center justify-center z-50 p-4">
            <div className="widget w-full max-w-4xl max-h-[90vh] flex flex-col relative">
                <header className="p-4 border-b border-gray-700 flex justify-between items-center flex-shrink-0">
                    <h2 className="text-xl font-bold text-gray-100">{title}</h2>
                    {onClose && <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors">×</button>}
                </header>
                <div className="p-6 overflow-y-auto">{children}</div>
            </div>
        </div>
    );
};

const TournamentDetailModal = ({ isOpen, onClose, tournament, onRegister }) => {
    if (!tournament) return null;

    const { name, region, buy_in_amount, prize_pool_gems, starts_at, status, capacity, registered_players, rules, prize_distribution } = tournament;

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={name}>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="md:col-span-1 space-y-4">
                    <div className="p-4 bg-gray-900/50 rounded-lg">
                        <h4 className="font-bold text-lg mb-2">Details</h4>
                        <p><strong>Region:</strong> {region}</p>
                        <p><strong>Starts:</strong> {new Date(starts_at).toLocaleString()}</p>
                        <p><strong>Status:</strong> <span className="font-semibold">{status.replace('_', ' ').toUpperCase()}</span></p>
                        <p><strong>Players:</strong> {registered_players} / {capacity}</p>
                    </div>
                     <div className="p-4 bg-gray-900/50 rounded-lg">
                        <h4 className="font-bold text-lg mb-2">Prizing</h4>
                        <p><strong>Buy-in:</strong> {buy_in_amount.toLocaleString()} Gems</p>
                        <p><strong>Prize Pool:</strong> {prize_pool_gems.toLocaleString()} Gems</p>
                        <ul className="text-sm mt-2 space-y-1">
                            {Object.entries(prize_distribution).map(([place, amount]) => (
                                <li key={place}><strong>#{place}:</strong> {amount.toLocaleString()} Gems</li>
                            ))}
                        </ul>
                    </div>
                </div>
                <div className="md:col-span-2 space-y-4">
                    <div className="p-4 bg-gray-900/50 rounded-lg">
                        <h4 className="font-bold text-lg mb-2">Rules</h4>
                        <p><strong>Allowed Maps:</strong> {rules.map_pool.join(', ') || 'All'}</p>
                        <p><strong>Banned Weapons:</strong> {rules.banned_weapons.join(', ') || 'None'}</p>
                    </div>
                     {status === 'registration_open' && (
                        <button 
                            onClick={() => onRegister(tournament)} 
                            className="btn btn-primary w-full"
                        >
                            Register Now ({buy_in_amount.toLocaleString()} Gems)
                        </button>
                    )}
                </div>
            </div>
        </Modal>
    );
};

export default TournamentDetailModal;
