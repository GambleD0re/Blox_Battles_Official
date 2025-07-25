import React, { Suspense, lazy } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';

// Import pages that are always needed
import AdminDashboard from './pages/AdminDashboard.jsx';
import Dashboard from './pages/Dashboard.jsx';
import LinkingView from './pages/LinkingView.jsx';
import SignInPage from './pages/SignInPage.jsx';
import SignUpPage from './pages/SignUpPage.jsx';
import SettingsPage from './pages/SettingsPage.jsx';

// Lazily load pages that are not part of the initial core experience.
const DepositPage = lazy(() => import('./pages/DepositPage.jsx'));
const WithdrawPage = lazy(() => import('./pages/WithdrawPage.jsx'));
const TransactionHistoryPage = lazy(() => import('./pages/TransactionHistoryPage.jsx'));
const BanNotice = lazy(() => import('./pages/BanNotice.jsx'));
// [NEW] Lazily load the new DuelHistoryPage.
const DuelHistoryPage = lazy(() => import('./pages/DuelHistoryPage.jsx'));

// --- UI COMPONENTS ---
const Loader = ({ fullScreen = false }) => (
    <div className={`flex items-center justify-center ${fullScreen ? 'fixed inset-0 bg-black bg-opacity-70 z-50' : ''}`}>
        <div className="w-12 h-12 border-4 border-[var(--accent-color)] border-t-transparent rounded-full animate-spin"></div>
    </div>
);

// A helper component to protect routes that require authentication.
const ProtectedRoute = ({ children, adminOnly = false }) => {
    const { user } = useAuth();

    if (!user) {
        return <Navigate to="/signin" />;
    }

    if (adminOnly && !user.is_admin) {
        return <Navigate to="/dashboard" />;
    }
    
    // Allow access to settings and transaction history even if roblox is not linked
    const allowedPaths = ['/link-account', '/settings', '/history'];
    if (!user.linked_roblox_username && !allowedPaths.includes(window.location.pathname)) {
        return <Navigate to="/link-account" />;
    }

    return children;
};

// --- MAIN APP COMPONENT (ROUTING) ---
const App = () => {
    const { user, isLoading } = useAuth();

    if (isLoading) {
        return <Loader fullScreen />;
    }

    if (user && user.status === 'banned') {
        return (
            <Suspense fallback={<Loader fullScreen />}>
                <BanNotice />
            </Suspense>
        );
    }

    return (
        <div style={{backgroundColor: 'var(--bg-color)'}} className="text-gray-200 min-h-screen">
            <Routes>
                {/* --- Public Routes --- */}
                <Route path="/signin" element={!user ? <SignInPage /> : <Navigate to="/dashboard" />} />
                <Route path="/signup" element={!user ? <SignUpPage /> : <Navigate to="/dashboard" />} />

                {/* --- Protected Routes --- */}
                <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
                <Route path="/link-account" element={<ProtectedRoute><LinkingView /></ProtectedRoute>} />
                <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
                
                <Route 
                    path="/deposit" 
                    element={
                        <ProtectedRoute>
                            <ErrorBoundary>
                                <Suspense fallback={<Loader fullScreen />}>
                                    <DepositPage />
                                </Suspense>
                            </ErrorBoundary>
                        </ProtectedRoute>
                    } 
                />
                
                <Route 
                    path="/withdraw" 
                    element={
                        <ProtectedRoute>
                            <ErrorBoundary>
                                <Suspense fallback={<Loader fullScreen />}>
                                    <WithdrawPage />
                                </Suspense>
                            </ErrorBoundary>
                        </ProtectedRoute>
                    } 
                />
                
                <Route 
                    path="/history" 
                    element={
                        <ProtectedRoute>
                            <ErrorBoundary>
                                <Suspense fallback={<Loader fullScreen />}>
                                    <TransactionHistoryPage />
                                </Suspense>
                            </ErrorBoundary>
                        </ProtectedRoute>
                    } 
                />

                {/* [NEW] Add the route for the new Duel History Page */}
                <Route 
                    path="/duel-history" 
                    element={
                        <ProtectedRoute>
                            <ErrorBoundary>
                                <Suspense fallback={<Loader fullScreen />}>
                                    <DuelHistoryPage />
                                </Suspense>
                            </ErrorBoundary>
                        </ProtectedRoute>
                    } 
                />
                
                {/* --- Admin Route --- */}
                <Route 
                    path="/admin" 
                    element={
                        <ProtectedRoute adminOnly={true}>
                            <ErrorBoundary>
                                <AdminDashboard />
                            </ErrorBoundary>
                        </ProtectedRoute>
                    } 
                />

                {/* --- Default Route --- */}
                <Route path="*" element={<Navigate to={user ? "/dashboard" : "/signin"} />} />
            </Routes>
        </div>
    );
};

export default App;