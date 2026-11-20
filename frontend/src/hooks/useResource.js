import { useCallback, useEffect, useRef, useState } from 'react';
import useOnlineStatus from './useOnlineStatus.js';

const initial = { status: 'loading', data: undefined, fromCache: false, fetchedAt: null, error: null };

/**
 * Loads data for a screen and tracks the four data-screen states.
 *
 *   useResource(key, fetcher) -> { status, data, fromCache, fetchedAt, error, reload }
 *     key      string; changing it refetches. null/undefined skips loading.
 *     fetcher  ({ signal }) => Promise<{ data, fromCache, fetchedAt }> (the api/client.js result shape)
 *     status   'loading' | 'loaded' | 'unavailable' (offline, nothing cached) | 'error'
 *
 * Aborts on unmount, refetches when the app comes back online, and keeps showing the last data
 * during a reload. If a reload fails because the device is offline, the last data stays and is
 * marked as from cache.
 */
export default function useResource(key, fetcher) {
    const { online } = useOnlineStatus();
    const [state, setState] = useState(initial);
    const [tick, setTick] = useState(0);
    const fetcherRef = useRef(fetcher);
    fetcherRef.current = fetcher;
    const keyRef = useRef(key);
    const wasOnline = useRef(online);

    useEffect(() => {
        if (key === null || key === undefined) return undefined;
        const keyChanged = keyRef.current !== key;
        keyRef.current = key;
        const controller = new AbortController();

        setState((prev) => (keyChanged || prev.data === undefined ? initial : prev));

        Promise.resolve()
            .then(() => fetcherRef.current({ signal: controller.signal }))
            .then((res) => {
                if (controller.signal.aborted) return;
                setState({
                    status: 'loaded',
                    data: res ? res.data : undefined,
                    fromCache: Boolean(res && res.fromCache),
                    fetchedAt: (res && res.fetchedAt) || null,
                    error: null,
                });
            })
            .catch((error) => {
                if (controller.signal.aborted || (error && error.name === 'AbortError')) return;
                setState((prev) => {
                    if (error && error.offline) {
                        if (prev.data !== undefined) return { ...prev, status: 'loaded', fromCache: true, error };
                        return { ...initial, status: 'unavailable', error };
                    }
                    return { ...prev, status: 'error', error };
                });
            });

        return () => controller.abort();
    }, [key, tick]);

    useEffect(() => {
        if (online && !wasOnline.current) setTick((t) => t + 1);
        wasOnline.current = online;
    }, [online]);

    const reload = useCallback(() => setTick((t) => t + 1), []);

    return { ...state, reload };
}
