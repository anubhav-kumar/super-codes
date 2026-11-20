/**
 * Service worker registration and update state (frontend-architecture.md section 8.5).
 * registerType is "prompt": a new worker waits until the user accepts the UpdatePrompt.
 */
import { registerSW } from 'virtual:pwa-register';

const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000;
const listeners = new Set();
let state = { needRefresh: false, offlineReady: false };
let updateSW = null;

function set(patch) {
    state = { ...state, ...patch };
    for (const l of listeners) l(state);
}

export function initServiceWorker() {
    if (updateSW || typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    updateSW = registerSW({
        immediate: true,
        onNeedRefresh: () => set({ needRefresh: true }),
        onOfflineReady: () => set({ offlineReady: true }),
        onRegisteredSW: (_url, registration) => {
            if (!registration) return;
            // Installed PWAs can stay open for days: check for new builds periodically.
            setInterval(() => {
                if (navigator.onLine) registration.update().catch(() => {});
            }, UPDATE_CHECK_INTERVAL_MS);
        },
    });
}

export const getServiceWorkerState = () => state;

export function subscribeServiceWorker(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

/** Activates the waiting worker and reloads into the new build. */
export function applyUpdate() {
    if (updateSW) updateSW(true);
}

export const dismissUpdate = () => set({ needRefresh: false });
