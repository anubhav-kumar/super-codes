import Avatar from '../Avatar.jsx';
import Icon from '../Icon.jsx';
import RelativeTime from '../RelativeTime.jsx';
import StatusBadge from './StatusBadge.jsx';
import { formatDateTime } from '../../utils/format.js';

/**
 * Comment block (read view, F-59): avatar, author · relative time · "edited", an optional status
 * line for a progress update, then the text. `id="comment-<id>"` is the deep-link target
 * (#comment-<id>); `highlight` flashes the background after a deep link.
 */
export default function CommentEntry({ entry, highlight = false }) {
    const author = (entry.actor && entry.actor.name) || 'Unknown user';
    const change = entry.statusChange;
    return (
        <article
            id={`comment-${entry.id}`}
            className={`-mx-2 flex scroll-mt-4 items-start gap-3 rounded-lg px-2 py-1 transition-colors duration-500 ${highlight ? 'bg-surface-muted' : ''}`}
        >
            <Avatar name={author} />
            <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-baseline gap-x-1.5 text-sm text-ink-muted">
                    <span className="font-medium text-ink">{author}</span>
                    <span aria-hidden="true">·</span>
                    <RelativeTime value={entry.createdAt} />
                    {entry.editedAt && (
                        <>
                            <span aria-hidden="true">·</span>
                            <span title={`Edited ${formatDateTime(entry.editedAt)}`}>edited</span>
                        </>
                    )}
                </p>
                {change && (
                    <p className="mt-1 flex flex-wrap items-center gap-1.5 text-sm text-ink-muted">
                        Changed status
                        <StatusBadge status={change.from} />
                        <Icon name="arrow-right" size="sm" className="text-ink-subtle" />
                        <span className="sr-only">to</span>
                        <StatusBadge status={change.to} />
                    </p>
                )}
                <p className="mt-1 text-[15px]/[22px] break-words whitespace-pre-line text-ink md:text-sm/6">{entry.text}</p>
            </div>
        </article>
    );
}
