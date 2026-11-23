import Icon from '../Icon.jsx';
import RelativeTime from '../RelativeTime.jsx';
import StatusBadge from './StatusBadge.jsx';
import { describeEvent } from './eventText.js';

/** System event: one compact muted line with a small icon circle. No actions. */
export default function EventEntry({ entry }) {
    const { icon, parts } = describeEvent(entry);
    return (
        <div className="flex items-start gap-3">
            {/* 24 px circle centred in the 32 px avatar column, so events line up with comments. */}
            <span className="flex w-8 shrink-0 justify-center">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-surface-muted text-ink-subtle">
                    <Icon name={icon} size="sm" />
                </span>
            </span>
            <p className="min-w-0 flex-1 pt-0.5 text-sm/6 break-words text-ink-muted">
                {parts.map((p, i) => {
                    if (p.strong !== undefined) {
                        return (
                            <span key={i} className="font-medium text-ink">
                                {p.strong}
                            </span>
                        );
                    }
                    if (p.status !== undefined) return <StatusBadge key={i} status={p.status} />;
                    return <span key={i}>{p.text}</span>;
                })}
                <span aria-hidden="true"> · </span>
                <RelativeTime value={entry.createdAt} />
            </p>
        </div>
    );
}
