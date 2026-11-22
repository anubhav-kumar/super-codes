import { formatDateTime } from '../../utils/format.js';
import Icon from '../Icon.jsx';

/** Shown by a page when its data came from the service worker cache. */
export default function StaleDataNotice({ fetchedAt, className = '' }) {
    if (!fetchedAt) return null;
    return (
        <p className={`flex items-center gap-1.5 text-xs text-ink-muted ${className}`}>
            <Icon name="history" className="h-3.5 w-3.5 shrink-0 text-ink-subtle" />
            Last updated {formatDateTime(fetchedAt, { seconds: false })}
        </p>
    );
}
