import { useSyncExternalStore } from 'react';
import { applyUpdate, dismissUpdate, getServiceWorkerState, subscribeServiceWorker } from '../offline/serviceWorker.js';

export default function useServiceWorkerUpdate() {
    const state = useSyncExternalStore(subscribeServiceWorker, getServiceWorkerState, getServiceWorkerState);
    return { ...state, applyUpdate, dismissUpdate };
}
