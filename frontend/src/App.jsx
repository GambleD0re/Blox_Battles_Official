import React, { Suspense, lazy } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import FeatureGuard from './components/FeatureGuard.jsx';

// Import pages that are always needed
import AdminDashboard from './pages/AdminDashboard.jsx';
import Dashboard from './pages/Dashboard.jsx';
import LinkingView from './pages/LinkingView.jsx';
import SignInPage from './pages/SignInPage.jsx';
import SignUpPage from './pages/SignUpPage.jsx';
import SettingsPage from './pages/SettingsPage.jsx';
import VerificationNoticePage from './pages/VerificationNoticePage.jsx'; // Import the new page

// Lazily load pages
const DepositPage = lazy(() => import('./pages/DepositPage.jsx'));
const WithdrawPage = lazy(() => import('./pages/WithdrawPage.jsx'));
const TransactionHistoryPage = lazy(() => import('./pages/TransactionHistoryPage.jsx'));
const BanNotice = lazy(() => import('./pages/BanNotice.jsx'));
const DuelHistoryPage = lazy(() => import('./pages/DuelHistoryPage.jsx'));
const TournamentsPage = lazy(() => import('./pages/TournamentsPage.jsx'));
const AdminTournamentCreatePage = lazy(() => import('./pages/AdminTournamentCreatePage.jsx'));
const TranscriptViewerPage = lazy(() => import('./pages/TranscriptViewerPage.jsx'));


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

    // New verification check: Gate access to most of the site if email is not verified
    if (!user.is_email_verified) {
        // Allow access only to settings and the verification notice page itself
        const allowedPaths = ['/settings', '/verification-notice'];
        if (!allowedPaths.includes(window.location.pathname)) {
            return <Navigate to="/verification-notice" />;
        }
    }
    
    if (user?.systemStatus?.roblox_linking?.isEnabled && !user.linked_roblox_username) {
        const allowedPaths = ['/link-account', '/settings', '/history'];
        if (!allowedPaths.includes(window.location.pathname)) {
            return <Navigate to="/link-account" />;
        }
    }

    return children;
};

// --- MAIN APP COMPONENT (ROUTING) ---
const App = () => {
    const { user, isLoading } = useAuth();

    if (isLoading) {
        return <Loader fullScreen />;
    }
    
    if (user && user.systemStatus?.site_wide_maintenance && !user.systemStatus.site_wide_maintenance.isEnabled) {
        const message = user.systemStatus.site_wide_maintenance.message || 'The platform is temporarily down for maintenance.';
        return (
             <div className="flex items-center justify-center min-h-screen bg-gray-900 text-white">
                <div className="w-full max-w-2xl p-8 space-y-6 bg-gray-800/50 rounded-xl shadow-lg border-2 border-yellow-700 text-center">
                    <h1 className="text-4xl font-black text-yellow-400">Under Maintenance</h1>
                    <p className="text-lg text-gray-300">{message}</p>
                </div>
            </div>
        );
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
                <Route path="/signup" element={!user ? <FeatureGuard featureName="user_registration"><SignUpPage /></FeatureGuard> : <Navigate to="/dashboard" />} />
                <Route path="/transcripts/:duelId" element={<Suspense fallback={<Loader fullScreen />}><TranscriptViewerPage /></Suspense>} />
                <Route path="/verification-notice" element={<VerificationNoticePage />} />

                {/* --- Protected Routes --- */}
                <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
                <Route path="/link-account" element={<ProtectedRoute><FeatureGuard featureName="roblox_linking"><LinkingView /></FeatureGuard></ProtectedRoute>} />
                <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
                
                <Route path="/deposit" element={<ProtectedRoute><FeatureGuard featureName="deposits"><Suspense fallback={<Loader fullScreen />}><DepositPage /></Suspense></FeatureGuard></ProtectedRoute>} />
                <Route path="/withdraw" element={<ProtectedRoute><FeatureGuard featureName="withdrawals"><Suspense fallback={<Loader fullScreen />}><WithdrawPage /></Suspense></FeatureGuard></ProtectedRoute>} />
                <Route path="/history" element={<ProtectedRoute><Suspense fallback={<Loader fullScreen />}><TransactionHistoryPage /></Suspense></ProtectedRoute>} />
                <Route path="/duel-history" element={<ProtectedRoute><Suspense fallback={<Loader fullScreen />}><DuelHistoryPage /></Suspense></ProtectedRoute>} />
                <Route path="/tournaments" element={<ProtectedRoute><FeatureGuard featureName="tournaments"><Suspense fallback={<Loader fullScreen />}><TournamentsPage /></Suspense></FeatureGuard></ProtectedRoute>} />
                
                {/* --- Admin Routes --- */}
                <Route path="/admin" element={<ProtectedRoute adminOnly={true}><AdminDashboard /></ProtectedRoute>} />
                <Route path="/admin/tournaments/create" element={<ProtectedRoute adminOnly={true}><FeatureGuard featureName="tournaments"><Suspense fallback={<Loader fullScreen />}><AdminTournamentCreatePage /></Suspense></FeatureGuard></ProtectedRoute>} />

                {/* --- Default Route --- */}
                <Route path="*" element={<Navigate to={user ? "/dashboard" : "/signin"} />} />
            </Routes>
        </div>
    );
};

export default App;
