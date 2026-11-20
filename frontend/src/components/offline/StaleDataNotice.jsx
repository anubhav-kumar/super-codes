import { formatDateTime } from '../../utils/format.js';

/** Shown by a page when its data came from the service worker cache. */
export default function StaleDataNotice({ fetchedAt, className = '' }) {
    if (!fetchedAt) return null;
    return (
        <p className={`rounded-control bg-warning-bg px-3 py-2 text-xs font-medium text-warning ${className}`}>
            Last updated {formatDateTime(fetchedAt, { seconds: false })}
        </p>
    );
}
