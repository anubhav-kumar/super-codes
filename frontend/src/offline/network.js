/**
 * Online/offline detection (frontend-architecture.md section 8.3).
 *
 * navigator.onLine only says a network interface exists. A failed API request
 * (reported by api/client.js) also marks the app offline until a later request succeeds.
 */

const listeners = new Set();
const deviceOnline = () => (typeof navigator === 'undefined' ? true : navigator.onLine);

let state = { deviceOnline: deviceOnline(), apiReachable: true, online: deviceOnline() };

function update(patch) {
    const next = { ...state, ...patch };
    next.online = next.deviceOnline && next.apiReachable;
    if (next.deviceOnline === state.deviceOnline && next.apiReachable === state.apiReachable) return;
    state = next;
    for (const l of listeners) l(state);
}

if (typeof window !== 'undefined') {
    window.addEventListener('online', () => update({ deviceOnline: true, apiReachable: true }));
    window.addEventListener('offline', () => update({ deviceOnline: false }));
}

export const getNetworkStatus = () => state;

export function subscribeNetworkStatus(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

export const reportNetworkFailure = () => update({ apiReachable: false, deviceOnline: deviceOnline() });
export const reportNetworkSuccess = () => update({ apiReachable: true, deviceOnline: true });
