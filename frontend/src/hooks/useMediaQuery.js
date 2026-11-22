import { useCallback, useSyncExternalStore } from 'react';

/** True while the CSS media query matches, e.g. useMediaQuery('(min-width: 768px)'). */
export default function useMediaQuery(query) {
    const subscribe = useCallback(
        (onChange) => {
            const list = window.matchMedia(query);
            list.addEventListener('change', onChange);
            return () => list.removeEventListener('change', onChange);
        },
        [query]
    );
    return useSyncExternalStore(
        subscribe,
        () => window.matchMedia(query).matches,
        () => false
    );
}
