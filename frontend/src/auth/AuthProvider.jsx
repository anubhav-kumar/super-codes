import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getMe, login, logout } from '../api/auth.js';
import { setUnauthorizedHandler } from '../api/client.js';
import { AuthContext } from './AuthContext.js';
import { clearLocalData } from './clearLocalData.js';
import { clearSession, readSession, writeSession } from './session.js';

/**
 * Holds the session and wires the API client's 401 handling.
 * The app trusts the local session on start (so it opens offline); when online it confirms the
 * session with GET /auth/me in the background, and a 401 there or on any data call signs out.
 */
export default function AuthProvider({ children }) {
    const navigate = useNavigate();
    const [session, setSession] = useState(readSession);
    const checkedRef = useRef(false);

    useEffect(
        () =>
            setUnauthorizedHandler(() => {
                if (!readSession()) return;
                clearSession();
                setSession(null);
                clearLocalData();
                const here = `${window.location.pathname}${window.location.search}`;
                const next = here.startsWith('/sign-in') ? '/' : here;
                navigate(`/sign-in?next=${encodeURIComponent(next)}&expired=1`, { replace: true });
            }),
        [navigate]
    );

    useEffect(() => {
        if (checkedRef.current || !session || !navigator.onLine) return;
        checkedRef.current = true;
        getMe()
            .then(({ data }) => {
                const current = readSession();
                if (!current || !data || !data.user) return;
                const next = { ...current, user: data.user, expiresAt: data.expiresAt || current.expiresAt };
                writeSession(next);
                setSession(next);
            })
            .catch(() => {
                // Offline or server error: keep the local session. A 401 is handled by the client.
            });
    }, [session]);

    const signIn = useCallback(async ({ email, password }) => {
        const { data } = await login({ email, password });
        const next = { token: data.token, expiresAt: data.expiresAt, user: data.user };
        // A fresh start for this user: drop anything left from an earlier session on this device.
        await clearLocalData();
        writeSession(next);
        checkedRef.current = true;
        setSession(next);
        return next;
    }, []);

    const signOut = useCallback(async () => {
        const token = readSession()?.token;
        clearSession();
        setSession(null);
        await clearLocalData();
        if (token) logout(token).catch(() => {});
    }, []);

    const value = useMemo(
        () => ({ session, user: session ? session.user : null, signIn, signOut }),
        [session, signIn, signOut]
    );

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
