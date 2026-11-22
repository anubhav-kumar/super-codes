import useOnlineStatus from '../../hooks/useOnlineStatus.js';
import Icon from '../Icon.jsx';

/** App-level, non-blocking offline message. Rendered once in App.jsx, above the scrolling content. */
export default function OfflineBanner() {
    const { online } = useOnlineStatus();
    if (online) return null;
    return (
        <div
            role="status"
            className="flex shrink-0 items-center justify-center gap-2 bg-ink px-4 py-2 text-center text-sm font-medium text-white"
        >
            <Icon name="offline" size="sm" className="shrink-0" />
            You are offline. Showing saved data.
        </div>
    );
}
