import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { getMe, login, logout } from '../api/auth.js';
import { setPasswordChangeHandler, setUnauthorizedHandler } from '../api/client.js';
import PageLoader from '../components/PageLoader.jsx';
import { AuthContext } from './AuthContext.js';
import { clearLocalData, clearScopedData, dataOwnerMismatch, writeDataOwner } from './clearLocalData.js';
import { scopeKey } from './roles.js';
import { clearSession, readSession, writeSession } from './session.js';

// /auth/me is checked again when the app comes back to the foreground after this long.
const RECHECK_AFTER_MS = 5 * 60 * 1000;

const sameId = (a, b) => a !== undefined && a !== null && b !== undefined && b !== null && String(a) === String(b);

/**
 * Holds the session and wires the API client's 401 and 403 PASSWORD_CHANGE_REQUIRED handling.
 *
 * The app trusts the local session on start (so it opens offline). When online it confirms the
 * session with GET /auth/me on start, when the device comes back online and when the app becomes
 * visible after 5 minutes or more. /auth/me carries the current role and Worker link:
 *   - another user id -> everything on the device is cleared (clearLocalData)
 *   - same user, new role or Worker link -> data cached under the old scope is cleared (clearScopedData);
 *     the shell remounts its pages on the new scope (AppShell), so they refetch
 * A 401 there or on any data call signs out and clears.
 *
 * Before anything renders, data left by another user (owner marker mismatch, e.g. a tab killed
 * half-way through sign-out) is cleared.
 */
export default function AuthProvider({ children }) {
    const navigate = useNavigate();
    const [session, setSession] = useState(readSession);
    const [ready, setReady] = useState(() => !dataOwnerMismatch(readSession()));
    const meRef = useRef(null);
    const lastCheckRef = useRef(0);

    useEffect(() => {
        if (ready) return undefined;
        let cancelled = false;
        clearLocalData().then(() => {
            const current = readSession();
            if (current && current.user) writeDataOwner(current.user.id);
            if (!cancelled) setReady(true);
        });
        return () => {
            cancelled = true;
        };
    }, [ready]);

    /** Merges `patch` ({ user, token, expiresAt }) into the stored session, clearing data first when the user or scope changed. */
    const updateSession = useCallback(async (patch) => {
        const current = readSession();
        if (!current || !patch) return null;
        const nextUser = patch.user || current.user;
        if (patch.user && current.user) {
            if (!sameId(patch.user.id, current.user.id)) {
                await clearLocalData();
                writeDataOwner(patch.user.id);
            } else if (scopeKey(patch.user) !== scopeKey(current.user)) {
                await clearScopedData();
            }
        }
        // Signed out or another sign-in while clearing: leave that session alone.
        if (readSession()?.token !== current.token) return null;
        const next = { ...current, ...patch, user: nextUser };
        writeSession(next);
        setSession(next);
        return next;
    }, []);

    /** GET /auth/me and apply the current user. One request at a time; rejects when offline. */
    const refreshMe = useCallback(() => {
        if (meRef.current) return meRef.current;
        if (!readSession()) return Promise.resolve(null);
        lastCheckRef.current = Date.now();
        const pending = getMe()
            .then(({ data }) => {
                if (!data || !data.user) return readSession();
                const patch = { user: data.user };
                if (data.expiresAt) patch.expiresAt = data.expiresAt;
                return updateSession(patch);
            })
            .finally(() => {
                meRef.current = null;
            });
        meRef.current = pending;
        return pending;
    }, [updateSession]);

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

    // A data route refused the session because a temporary password is still active: RequireAuth
    // then sends the user to "Set a new password".
    useEffect(
        () =>
            setPasswordChangeHandler(() => {
                const current = readSession();
                if (!current || !current.user || current.user.mustChangePassword) return;
                updateSession({ user: { ...current.user, mustChangePassword: true } });
            }),
        [updateSession]
    );

    useEffect(() => {
        if (!ready) return undefined;
        const check = () => {
            if (readSession() && navigator.onLine) refreshMe().catch(() => {});
        };
        const onVisible = () => {
            if (document.visibilityState === 'visible' && Date.now() - lastCheckRef.current >= RECHECK_AFTER_MS) check();
        };
        if (lastCheckRef.current === 0) check();
        window.addEventListener('online', check);
        document.addEventListener('visibilitychange', onVisible);
        return () => {
            window.removeEventListener('online', check);
            document.removeEventListener('visibilitychange', onVisible);
        };
    }, [ready, refreshMe]);

    const signIn = useCallback(async ({ email, password }) => {
        const { data } = await login({ email, password });
        const next = { token: data.token, expiresAt: data.expiresAt, user: data.user };
        // A fresh start for this user: drop anything left from an earlier session on this device.
        await clearLocalData();
        writeSession(next);
        writeDataOwner(data.user && data.user.id);
        lastCheckRef.current = Date.now();
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
        () => ({ session, user: session ? session.user : null, signIn, signOut, refreshMe, updateSession }),
        [session, signIn, signOut, refreshMe, updateSession]
    );

    return (
        <AuthContext.Provider value={value}>{ready ? children : <PageLoader fullScreen />}</AuthContext.Provider>
    );
}
