import useOnlineStatus from '../../hooks/useOnlineStatus.js';

/** App-level, non-blocking offline message. Rendered once in App.jsx. */
export default function OfflineBanner() {
    const { online } = useOnlineStatus();
    if (online) return null;
    return (
        <div role="status" className="sticky top-0 z-40 bg-amber-500 px-4 py-2 text-center text-sm font-medium text-amber-950">
            You are offline. Showing saved data.
        </div>
    );
}
