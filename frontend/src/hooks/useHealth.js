import { useCallback, useEffect, useRef, useState } from 'react';
import { getHealth } from '../api/health.js';

const POLL_MS = 30 * 1000;

/**
 * Health check state:
 *   checking    - first request in flight
 *   online      - API answered (serverTimestamp set)
 *   unreachable - request failed while the device is online
 *   offline     - the device is offline
 */
export default function useHealth() {
    const [state, setState] = useState({ status: 'checking', serverTimestamp: null });
    const controllerRef = useRef(null);

    const check = useCallback(async () => {
        if (controllerRef.current) controllerRef.current.abort();
        if (!navigator.onLine) {
            setState({ status: 'offline', serverTimestamp: null });
            return;
        }
        const controller = new AbortController();
        controllerRef.current = controller;
        try {
            const { data } = await getHealth({ signal: controller.signal });
            setState({ status: 'online', serverTimestamp: data && data.serverTimestamp });
        } catch (err) {
            if (err && err.name === 'AbortError') return;
            setState({ status: navigator.onLine ? 'unreachable' : 'offline', serverTimestamp: null });
        }
    }, []);

    useEffect(() => {
        check();
        const timer = setInterval(check, POLL_MS);
        window.addEventListener('online', check);
        window.addEventListener('offline', check);
        return () => {
            clearInterval(timer);
            window.removeEventListener('online', check);
            window.removeEventListener('offline', check);
            if (controllerRef.current) controllerRef.current.abort();
        };
    }, [check]);

    return { ...state, refresh: check };
}
