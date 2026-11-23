import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import DataView from '../DataView.jsx';
import EmptyState from '../EmptyState.jsx';
import Section from '../Section.jsx';
import TimelineList, { TIMELINE_VISIBLE } from '../timeline/TimelineList.jsx';
import CommentComposer from '../timeline/CommentComposer.jsx';
import { visibleEntries } from '../timeline/eventText.js';
import { orderStatusLabel } from '../../constants/orders.js';
import useOrderTimeline from '../../hooks/useOrderTimeline.js';
import useToast from '../../hooks/useToast.js';

const FLASH_MS = 2000;
const NO_ITEMS = [];

/**
 * Timeline section of order detail (F-59): comments and status changes, oldest first.
 *
 * Refresh: reloads when the order's activity marker changes (the page reloads the order after a
 * status change or an assignment change), when the app comes back online (useResource), and, from
 * F-60, after the user's own post / edit / delete. The order detail carries no latestActivityAt
 * (the backend derives it per timeline read), so `updatedAt` is the marker, with latestActivityAt
 * used as well when present.
 *
 * Deep links: #timeline scrolls the section into view; #comment-<id> reveals earlier entries when
 * needed, centres that comment and flashes it for 2 s.
 *
 * Comment box (F-60) at the bottom: after a post the timeline reloads and the list scrolls to the new
 * comment; after a progress update `onOrderChange` (the page's order reload) runs so the header
 * status, due label and billing follow.
 */
export default function OrderTimelineSection({ order, onOrderChange, className = '' }) {
    const timeline = useOrderTimeline(order.id);
    const { reload } = timeline;
    const items = (timeline.data && timeline.data.items) || NO_ITEMS;
    const entries = useMemo(() => visibleEntries(items), [items]);
    const commentCount = entries.filter((e) => e.kind === 'COMMENT').length;

    const [showAll, setShowAll] = useState(false);
    const [flashId, setFlashId] = useState(null);
    const [postedId, setPostedId] = useState(null);
    const toast = useToast();

    // Reload on a later activity change; the first render already loads.
    const activity = `${order.latestActivityAt || ''}|${order.updatedAt || ''}`;
    const lastActivity = useRef(activity);
    useEffect(() => {
        if (lastActivity.current === activity) return;
        lastActivity.current = activity;
        reload();
    }, [activity, reload]);

    // Deep links, handled once per hash after the timeline has loaded.
    const { hash } = useLocation();
    const loaded = timeline.status === 'loaded';
    const handledHash = useRef(null);
    useEffect(() => {
        if (!loaded || !hash || handledHash.current === hash) return;
        const match = /^#comment-(.+)$/.exec(hash);
        if (hash !== '#timeline' && !match) return;
        handledHash.current = hash;
        const index = match ? entries.findIndex((e) => e.kind === 'COMMENT' && e.id === decodeURIComponent(match[1])) : -1;
        if (index === -1) {
            // #timeline, or a comment that is gone (deleted): show the section itself.
            const section = document.getElementById('timeline');
            if (section) section.scrollIntoView({ block: 'start', behavior: 'smooth' });
            return;
        }
        if (index < entries.length - TIMELINE_VISIBLE) setShowAll(true);
        setFlashId(entries[index].id);
    }, [loaded, hash, entries]);

    // Scroll after the comment is rendered (revealing earlier entries may have just added it).
    useEffect(() => {
        if (!flashId) return undefined;
        const el = document.getElementById(`comment-${flashId}`);
        if (el) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
        const t = setTimeout(() => setFlashId(null), FLASH_MS);
        return () => clearTimeout(t);
    }, [flashId]);

    // After the user's own post: scroll to the new comment once the reload has it.
    useEffect(() => {
        if (!postedId || !entries.some((e) => e.id === postedId)) return;
        const el = document.getElementById(`comment-${postedId}`);
        if (el) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        setPostedId(null);
    }, [postedId, entries]);

    function onPosted({ comment, order: saved }) {
        if (comment && comment.id) setPostedId(comment.id);
        reload();
        const change = comment && comment.statusChange;
        if (change || (saved && saved.status && saved.status !== order.status)) {
            toast.success(`Status changed to ${orderStatusLabel((change && change.to) || saved.status)}`);
            if (onOrderChange) onOrderChange();
        }
    }

    return (
        <Section id="timeline" title="Timeline" count={commentCount || ''} flush={false} className={className}>
            <DataView resource={timeline} compact>
                {() =>
                    entries.length === 0 ? (
                        <EmptyState icon="comment" compact title="No activity yet" text="Comments and status changes show here." />
                    ) : (
                        <TimelineList entries={entries} showAll={showAll} onShowAll={() => setShowAll(true)} highlightId={flashId} />
                    )
                }
            </DataView>
            <CommentComposer order={order} onPosted={onPosted} onOrderChanged={onOrderChange} />
        </Section>
    );
}
