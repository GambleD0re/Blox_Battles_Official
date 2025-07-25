import React, { useState, useEffect, useCallback, createContext, useContext } from 'react';
import * as api from '../services/api';

const AuthContext = createContext(null);

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [token, setToken] = useState(() => localStorage.getItem('token'));
    const [isLoading, setIsLoading] = useState(true);

    const logout = useCallback(() => {
        localStorage.removeItem('token');
        setToken(null);
        setUser(null);
    }, []);

    useEffect(() => {
        const fetchInitialData = async (tokenToUse) => {
            if (!tokenToUse) {
                setIsLoading(false);
                return;
            }
            try {
                const userData = await api.getDashboardData(tokenToUse);
                setUser(userData);
            } catch (error) {
                console.error("Initial auth failed, logging out.", error);
                logout();
            } finally {
                setIsLoading(false);
            }
        };
        
        const urlParams = new URLSearchParams(window.location.search);
        const urlToken = urlParams.get('token');

        if (urlToken) {
            localStorage.setItem('token', urlToken);
            setToken(urlToken);
            window.history.replaceState({}, document.title, window.location.pathname);
            fetchInitialData(urlToken);
        } else {
            fetchInitialData(token);
        }
    }, [logout]); 

    const login = useCallback(async (newToken) => {
        localStorage.setItem('token', newToken);
        setToken(newToken);
        setIsLoading(true);
        try {
            const userData = await api.getDashboardData(newToken);
            setUser(userData);
        } catch (error) {
            logout();
        } finally {
            setIsLoading(false);
        }
    }, [logout]);
    
    // [MODIFIED] The refreshUser function no longer accepts an argument and fetches its own data.
    // This makes it a self-contained and reusable function that won't cause re-render loops.
    const refreshUser = useCallback(async () => {
       const tokenFromStorage = localStorage.getItem('token');
       if (!tokenFromStorage) {
           console.error("No token found, cannot refresh user.");
           logout(); // Log out if token is missing
           return;
       }
       try {
           const newUserData = await api.getDashboardData(tokenFromStorage);
           setUser(newUserData);
       } catch (error) {
           console.error("Failed to refresh user data:", error);
           logout();
       }
    }, [logout]);

    const value = { user, token, login, logout, isLoading, refreshUser };

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};