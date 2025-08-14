import React, { Suspense, lazy, useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import FeatureGuard from './components/FeatureGuard.jsx';

import AdminDashboard from './pages/AdminDashboard.jsx';
import Dashboard from './pages/Dashboard.jsx';
import LinkingView from './pages/LinkingView.jsx';
import SignInPage from './pages/SignInPage.jsx';
import SignUpPage from './pages/SignUpPage.jsx';
import SettingsPage from './pages/SettingsPage.jsx';
import VerificationNoticePage from './pages/VerificationNoticePage.jsx';

const DepositPage = lazy(() => import('./pages/DepositPage.jsx'));
const WithdrawPage = lazy(() => import('./pages/WithdrawPage.jsx'));
const TransactionHistoryPage = lazy(() => import('./pages/TransactionHistoryPage.jsx'));
const BanNotice = lazy(() => import('./pages/BanNotice.jsx'));
const DuelHistoryPage = lazy(() => import('./pages/DuelHistoryPage.jsx'));
const TournamentsPage = lazy(() => import('./pages/TournamentsPage.jsx'));
const AdminTournamentCreatePage = lazy(() => import('./pages/AdminTournamentCreatePage.jsx'));
const TranscriptViewerPage = lazy(() => import('./pages/TranscriptViewerPage.jsx'));
const TicketTranscriptViewerPage = lazy(() => import('./pages/TicketTranscriptViewerPage.jsx'));
const VerifyEmailPage = lazy(() => import('./pages/VerifyEmailPage.jsx'));
const ForgotPasswordPage = lazy(() => import('./pages/ForgotPasswordPage.jsx'));
const ResetPasswordPage = lazy(() => import('./pages/ResetPasswordPage.jsx'));

const MASTER_ADMIN_EMAIL = 'scriptmail00@gmail.com';

const Loader = ({ fullScreen = false }) => (
    <div className={`flex items-center justify-center ${fullScreen ? 'fixed inset-0 bg-black bg-opacity-70 z-50' : ''}`}>
        <div className="w-12 h-12 border-4 border-[var(--accent-color)] border-t-transparent rounded-full animate-spin"></div>
    </div>
);

const ProtectedRoute = ({ children, adminOnly = false }) => {
    const { user } = useAuth();

    if (!user) {
        return <Navigate to="/signin" />;
    }

    if (adminOnly && !user.is_admin) {
        return <Navigate to="/dashboard" />;
    }

    if (user.password_hash && !user.is_email_verified) {
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

const App = () => {
    const { user, systemStatus, isLoading, token } = useAuth();

    useEffect(() => {
        if (!token) return;

        const backendUrl = new URL(import.meta.env.VITE_API_BASE_URL || window.location.origin);
        const wsUrl = `wss://${backendUrl.host}`;
        const ws = new WebSocket(wsUrl);

        ws.onopen = () => {
            console.log('[WebSocket] Connected to main server.');
            if (token) {
                ws.send(JSON.stringify({ type: 'auth', token: token }));
            }
        };

        ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                if (data.type === 'match_found') {
                    console.log('[WebSocket] Match found! Opening server link.');
                    window.open(data.payload.serverLink, '_blank');
                }
            } catch (error) {
                console.error('[WebSocket] Error processing message:', error);
            }
        };
        
        ws.onclose = () => {
            console.log('[WebSocket] Disconnected from main server.');
        };

        return () => {
            ws.close();
        };

    }, [token]);

    if (isLoading) {
        return <Loader fullScreen />;
    }
    
    if (systemStatus?.site_wide_maintenance && !systemStatus.site_wide_maintenance.isEnabled && user?.email !== MASTER_ADMIN_EMAIL) {
        const message = systemStatus.site_wide_maintenance.message || 'The platform is temporarily down for maintenance.';
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
             <ErrorBoundary>
                <Suspense fallback={<Loader fullScreen />}>
                    <Routes>
                        <Route path="/signin" element={!user ? <SignInPage /> : <Navigate to="/dashboard" />} />
                        <Route path="/signup" element={
                            !user ? (
                                <FeatureGuard featureName="user_registration">
                                    <SignUpPage />
                                </FeatureGuard>
                            ) : (
                                <Navigate to="/dashboard" />
                            )
                        } />
                        <Route path="/transcripts/:duelId" element={<TranscriptViewerPage />} />
                        <Route path="/transcripts/ticket/:ticketId" element={<TicketTranscriptViewerPage />} />
                        <Route path="/verification-notice" element={<VerificationNoticePage />} />
                        <Route path="/verify-email" element={<VerifyEmailPage />} />
                        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
                        <Route path="/reset-password" element={<ResetPasswordPage />} />
                        

                        <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
                        <Route path="/link-account" element={<ProtectedRoute><FeatureGuard featureName="roblox_linking"><LinkingView /></FeatureGuard></ProtectedRoute>} />
                        <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
                        
                        <Route path="/deposit" element={<ProtectedRoute><FeatureGuard featureName="deposits"><DepositPage /></FeatureGuard></ProtectedRoute>} />
                        <Route path="/withdraw" element={<ProtectedRoute><FeatureGuard featureName="withdrawals"><WithdrawPage /></FeatureGuard></ProtectedRoute>} />
                        <Route path="/history" element={<ProtectedRoute><TransactionHistoryPage /></ProtectedRoute>} />
                        <Route path="/duel-history" element={<ProtectedRoute><DuelHistoryPage /></ProtectedRoute>} />
                        <Route path="/tournaments" element={<ProtectedRoute><FeatureGuard featureName="tournaments"><TournamentsPage /></FeatureGuard></ProtectedRoute>} />
                        
                        <Route path="/admin" element={<ProtectedRoute adminOnly={true}><AdminDashboard /></ProtectedRoute>} />
                        <Route path="/admin/tournaments/create" element={<ProtectedRoute adminOnly={true}><FeatureGuard featureName="tournaments"><AdminTournamentCreatePage /></FeatureGuard></ProtectedRoute>} />

                        <Route path="*" element={<Navigate to={user ? "/dashboard" : "/signin"} />} />
                    </Routes>
                </Suspense>
             </ErrorBoundary>
        </div>
    );
};

export default App;
