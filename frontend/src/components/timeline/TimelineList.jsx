import { Fragment } from 'react';
import CommentEntry from './CommentEntry.jsx';
import EventEntry from './EventEntry.jsx';
import { dayLabel, localDayKey } from '../../utils/relativeTime.js';

/** How many of the newest entries show before "Show earlier (n)". */
export const TIMELINE_VISIBLE = 30;

function DayDivider({ iso }) {
    return (
        <li aria-hidden="true" className="flex items-center gap-3 text-xs font-medium text-ink-subtle">
            <span className="h-px flex-1 bg-line" />
            {dayLabel(iso)}
            <span className="h-px flex-1 bg-line" />
        </li>
    );
}

/**
 * Timeline entries oldest first (newest last), with a day divider before each new local day.
 * Shows the newest TIMELINE_VISIBLE unless `showAll`; the rest sit behind a "Show earlier (n)" button.
 * `orderId` and `onCommentChanged` enable the comment edit / delete actions (F-61).
 */
export default function TimelineList({ entries, showAll = false, onShowAll, highlightId, orderId, onCommentChanged }) {
    const hidden = showAll ? 0 : Math.max(0, entries.length - TIMELINE_VISIBLE);
    const shown = hidden ? entries.slice(hidden) : entries;
    return (
        <>
            {hidden > 0 && (
                <button
                    type="button"
                    onClick={onShowAll}
                    className="mb-4 flex min-h-11 w-full items-center justify-center rounded-lg text-sm font-medium text-ink-muted transition hover:bg-surface-subtle hover:text-ink focus-visible:outline-2 focus-visible:outline-accent md:min-h-10"
                >
                    Show earlier ({hidden})
                </button>
            )}
            <ol className="flex flex-col gap-4">
                {shown.map((entry, i) => {
                    const day = localDayKey(entry.createdAt);
                    const newDay = i === 0 || day !== localDayKey(shown[i - 1].createdAt);
                    return (
                        <Fragment key={entry.id}>
                            {newDay && <DayDivider iso={entry.createdAt} />}
                            <li>
                                {entry.kind === 'COMMENT' ? (
                                    <CommentEntry
                                        entry={entry}
                                        orderId={orderId}
                                        onChanged={onCommentChanged}
                                        highlight={entry.id === highlightId}
                                    />
                                ) : (
                                    <EventEntry entry={entry} />
                                )}
                            </li>
                        </Fragment>
                    );
                })}
            </ol>
        </>
    );
}
