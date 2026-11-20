import { formatDateTime } from '../utils/format.js';

const STYLES = {
    checking: { dot: 'bg-slate-400 animate-pulse', ring: 'ring-slate-500/30', label: 'Checking API…' },
    online: { dot: 'bg-emerald-400', ring: 'ring-emerald-400/30', label: 'API online' },
    unreachable: { dot: 'bg-rose-500', ring: 'ring-rose-500/30', label: 'API unreachable' },
    offline: { dot: 'bg-slate-500', ring: 'ring-slate-500/30', label: 'Offline' },
};

export default function HealthIndicator({ status, serverTimestamp, onRetry }) {
    const s = STYLES[status] || STYLES.checking;
    return (
        <div
            role="status"
            aria-live="polite"
            className={`inline-flex items-center gap-3 rounded-full bg-white/5 px-4 py-2 text-sm ring-1 ${s.ring}`}
        >
            <span className="relative flex h-2.5 w-2.5">
                {status === 'online' && (
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                )}
                <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${s.dot}`} />
            </span>
            <span className="font-medium text-slate-100">{s.label}</span>
            {status === 'online' && serverTimestamp && (
                <span className="text-slate-400 tabular-nums">· {formatDateTime(serverTimestamp)}</span>
            )}
            {status === 'unreachable' && onRetry && (
                <button type="button" onClick={onRetry} className="text-rose-300 underline-offset-2 hover:underline">
                    Retry
                </button>
            )}
        </div>
    );
}
