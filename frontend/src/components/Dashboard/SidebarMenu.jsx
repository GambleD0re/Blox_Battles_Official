import React from 'react';
import { NavLink } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';

const SidebarMenu = ({ isOpen, onClose }) => {
    const menuVariants = {
        hidden: { x: '-100%' },
        visible: { x: 0 },
    };

    const navLinkClasses = ({ isActive }) =>
        `block p-4 rounded-lg text-lg font-semibold transition-colors ${
            isActive ? 'bg-gray-700 text-white' : 'text-gray-400 hover:bg-gray-800 hover:text-white'
        }`;

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="fixed inset-0 bg-black/60 z-40"
                    />
                    <motion.div
                        variants={menuVariants}
                        initial="hidden"
                        animate="visible"
                        exit="hidden"
                        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
                        className="fixed top-0 left-0 bottom-0 w-80 bg-[var(--widget-bg)] border-r border-[var(--widget-border)] shadow-2xl z-50 p-6 flex flex-col"
                    >
                        <h2 className="text-2xl font-bold text-white mb-8">Navigation</h2>
                        <nav className="flex flex-col gap-4">
                            <NavLink to="/deposit" className={navLinkClasses} onClick={onClose}>Deposit</NavLink>
                            <NavLink to="/withdraw" className={navLinkClasses} onClick={onClose}>Withdraw</NavLink>
                            <NavLink to="/tournaments" className={navLinkClasses} onClick={onClose}>Tournaments</NavLink>
                            <NavLink to="/history" className={navLinkClasses} onClick={onClose}>Transaction History</NavLink>
                            <NavLink to="/duel-history" className={navLinkClasses} onClick={onClose}>Duel History</NavLink>
                        </nav>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
};

export default SidebarMenu;
