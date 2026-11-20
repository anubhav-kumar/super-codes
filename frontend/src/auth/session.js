/**
 * The signed-in session, kept in localStorage so it survives closing the app.
 * Shape: { token, expiresAt, user: { id, email, name } }.
 */
const KEY = 'ca-crm.session';

export function readSession() {
    try {
        const raw = localStorage.getItem(KEY);
        if (!raw) return null;
        const session = JSON.parse(raw);
        return session && typeof session.token === 'string' && session.token ? session : null;
    } catch {
        return null;
    }
}

export function writeSession(session) {
    try {
        localStorage.setItem(KEY, JSON.stringify(session));
    } catch {
        // Storage full or blocked: the session then lasts only until the app is closed.
    }
}

export function clearSession() {
    try {
        localStorage.removeItem(KEY);
    } catch {
        // ignore
    }
}

export const getToken = () => readSession()?.token || null;
