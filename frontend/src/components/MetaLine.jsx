import { Children } from 'react';

/**
 * A wrapping line of details separated by "·", where a separator never starts or ends a visual line
 * (F-32). Each item carries its own leading dot (a 12 px ::before box) and the line is shifted 12 px
 * left inside a box that clips horizontally, so the dot of whichever item starts a line (the first
 * item, or one that wrapped) falls into the clipped strip. A dot travels with the item after it, so
 * it can never end a line. An item that renders nothing (e.g. a component returning null) leaves an
 * empty wrapper, hidden with :empty together with its dot. The dot has empty alt text, so screen
 * readers skip it.
 *   <MetaLine className="text-sm text-ink-muted" items={['GST Return Filing', <DueLabel key="due" … />]} />
 * null, undefined, false and '' items are skipped. `className` (text styles, padding) goes on the
 * outer element; the clipping box inside it has no padding.
 */
export default function MetaLine({ items, as: Tag = 'span', className = '' }) {
    const list = Children.toArray((Array.isArray(items) ? items : [items]).filter((m) => m !== null && m !== undefined && m !== false && m !== ''));
    if (list.length === 0) return null;
    return (
        <Tag className={`block min-w-0 ${className}`}>
            {/* Clip box without padding of its own: padding would leave room for the shifted dot. */}
            <span className="block overflow-x-clip">
                <span className="-ml-3 flex flex-wrap items-center gap-y-0.5">
                    {list.map((item, i) => (
                        <span
                            key={item.key ?? i}
                            className="inline-flex min-w-0 items-center empty:hidden before:inline-block before:w-3 before:shrink-0 before:text-center before:text-ink-subtle before:content-['·'_/_'']"
                        >
                            {item}
                        </span>
                    ))}
                </span>
            </span>
        </Tag>
    );
}
