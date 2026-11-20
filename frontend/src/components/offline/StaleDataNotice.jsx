import { formatDateTime } from '../../utils/format.js';

/** Shown by a page when its data came from the service worker cache. */
export default function StaleDataNotice({ fetchedAt }) {
    if (!fetchedAt) return null;
    return (
        <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-xs text-amber-300 ring-1 ring-amber-500/20">
            Last updated {formatDateTime(fetchedAt, { seconds: false })}
        </p>
    );
}
