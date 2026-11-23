/**
 * Timeline event type -> icon and sentence parts (F-59; P-30 adds assignment and file types).
 * Parts are { text } (plain), { strong } (a name) or { status } (an order status code shown as a
 * Badge); EventEntry renders them. Unknown types fall back to "<actor> updated the order", so new
 * backend event types never break the list.
 */

const actorName = (entry) => (entry.actor && entry.actor.name) || 'Someone';

const DESCRIBERS = {
    STATUS_CHANGED: (entry) => {
        const d = entry.details || {};
        return {
            icon: 'arrow-right',
            parts: [{ strong: actorName(entry) }, { text: ' changed status from ' }, { status: d.from }, { text: ' to ' }, { status: d.to }],
        };
    },
};

export function describeEvent(entry) {
    const describe = DESCRIBERS[entry.type];
    if (describe) return describe(entry);
    return { icon: 'history', parts: [{ strong: actorName(entry) }, { text: ' updated the order' }] };
}

/**
 * The entries the timeline shows, in server order (oldest first). A STATUS_CHANGED event written by
 * a progress update (details.commentId) is hidden while that comment is in the list, because the
 * comment already shows the status line; once the comment is deleted the event shows on its own.
 */
export function visibleEntries(items) {
    const commentIds = new Set(items.filter((e) => e.kind === 'COMMENT').map((e) => e.id));
    return items.filter(
        (e) => !(e.kind === 'EVENT' && e.type === 'STATUS_CHANGED' && e.details && e.details.commentId && commentIds.has(e.details.commentId)),
    );
}
