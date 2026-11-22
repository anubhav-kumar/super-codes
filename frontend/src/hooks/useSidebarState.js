import { useCallback, useState } from 'react';
import useMediaQuery from './useMediaQuery.js';

/** localStorage key for the desktop sidebar choice. Kept on sign-out (it holds no client data). */
export const SIDEBAR_KEY = 'ca-crm.sidebar';

function readStored() {
    try {
        const value = window.localStorage.getItem(SIDEBAR_KEY);
        return value === 'collapsed' || value === 'expanded' ? value : null;
    } catch {
        return null;
    }
}

/**
 * Desktop sidebar state, remembered per browser. With no stored choice the sidebar is
 * expanded from 1280 px and collapsed between 768 and 1279 px.
 */
export default function useSidebarState() {
    const wide = useMediaQuery('(min-width: 1280px)');
    const [stored, setStored] = useState(readStored);
    const collapsed = stored ? stored === 'collapsed' : !wide;

    const setCollapsed = useCallback((next) => {
        const value = next ? 'collapsed' : 'expanded';
        setStored(value);
        try {
            window.localStorage.setItem(SIDEBAR_KEY, value);
        } catch {
            // Storage blocked (private mode): the choice lasts for this page only.
        }
    }, []);

    const toggle = useCallback(() => setCollapsed(!collapsed), [collapsed, setCollapsed]);

    return { collapsed, setCollapsed, toggle };
}
