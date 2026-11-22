import { Link } from 'react-router-dom';
import Icon from './Icon.jsx';

const ALIGN = { left: 'text-left', right: 'text-right', center: 'text-center' };

// `nowrap: true` keeps a cell on one line; `nowrap: 'wide'` only once the table is at least 56rem
// wide (the table wrapper is a size container), so a crowded table can still wrap that column.
const NOWRAP = { true: 'whitespace-nowrap', wide: '@min-[56rem]:whitespace-nowrap' };

const keyOf = (value) => String(value || '').replace(/^-/, '');

function SortHeader({ column, sort, onSortChange }) {
    const activeKey = keyOf(sort);
    const active = activeKey === column.sortKey;
    const desc = active && String(sort).startsWith('-');
    const next = active ? (desc ? column.sortKey : `-${column.sortKey}`) : column.sortDesc ? `-${column.sortKey}` : column.sortKey;
    const right = column.align === 'right';
    return (
        <button
            type="button"
            onClick={() => onSortChange(next)}
            className={`-mx-1 inline-flex items-center gap-1 rounded-control px-1 py-0.5 font-medium hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent ${right ? 'flex-row-reverse' : ''} ${active ? 'text-ink' : ''}`}
        >
            {column.header}
            <Icon name={active ? (desc ? 'sort-desc' : 'sort-asc') : 'sort'} size="sm" className={active ? '' : 'text-ink-subtle'} />
        </button>
    );
}

function headerContent(col, sort, onSortChange) {
    return col.sortKey && onSortChange ? <SortHeader column={col} sort={sort} onSortChange={onSortChange} /> : col.header;
}

/**
 * Desktop table (used at lg+ through ResponsiveList).
 *   columns: [{ key, header, render(row), align: 'left' | 'right', sortKey, sortDesc, width, minWidth, nowrap, className }]
 *   - width: preferred column width (a hint in the auto-layout table).
 *   - minWidth: the column never gets narrower than this (any CSS length, e.g. '15rem' or
 *     'min(12rem, 15cqi)'; cqi = % of the table's width). Rendered as a block inside the header
 *     cell, because min-width on th / td is unreliable in auto-layout tables. Use it on name columns
 *     so short names stay on one line while other columns have room.
 *   - nowrap: true | 'wide' (see NOWRAP).
 *   rows, rowKey(row), rowHref(row), sort ('due' / '-amount', from useListSort), onSortChange(next), caption (screen readers)
 * The first column's content is a real link stretched over the whole row, so click, keyboard and
 * middle-click all work; other interactive content in a cell needs `relative z-10`.
 * Header sticks to the top of the scrolling <main>. Numbers right-aligned and tabular; long text wraps unless the column is `nowrap`.
 * Sortable headers are buttons; the sorted one sets aria-sort. A column whose sortKey starts
 * descending (amounts, dates) sets `sortDesc`.
 */
export default function DataTable({ columns, rows, rowKey, rowHref, sort, onSortChange, caption, className = '' }) {
    const sortedKey = keyOf(sort);
    const sortedDesc = String(sort || '').startsWith('-');

    return (
        <div className={`@container rounded-card border border-line bg-surface ${className}`}>
            <table className="w-full border-separate border-spacing-0 text-sm">
                {caption && <caption className="sr-only">{caption}</caption>}
                <thead>
                    <tr>
                        {columns.map((col) => {
                            const sorted = col.sortKey && col.sortKey === sortedKey;
                            return (
                                <th
                                    key={col.key}
                                    scope="col"
                                    style={col.width ? { width: col.width } : undefined}
                                    aria-sort={sorted ? (sortedDesc ? 'descending' : 'ascending') : undefined}
                                    className={`sticky top-0 z-10 h-10 border-b border-line bg-surface-subtle px-4 text-xs font-medium whitespace-nowrap text-ink-muted first:rounded-tl-card last:rounded-tr-card ${ALIGN[col.align] || ALIGN.left}`}
                                >
                                    {col.minWidth ? (
                                        <div style={{ minWidth: col.minWidth }}>{headerContent(col, sort, onSortChange)}</div>
                                    ) : (
                                        headerContent(col, sort, onSortChange)
                                    )}
                                </th>
                            );
                        })}
                    </tr>
                </thead>
                <tbody>
                    {rows.map((row, r) => {
                        const href = rowHref ? rowHref(row) : null;
                        const last = r === rows.length - 1;
                        return (
                            <tr key={rowKey(row)} className={`relative ${href ? 'hover:bg-surface-subtle has-[a:focus-visible]:bg-surface-subtle' : ''}`}>
                                {columns.map((col, c) => {
                                    const content = col.render ? col.render(row) : row[col.key];
                                    return (
                                        <td
                                            key={col.key}
                                            className={`h-11 px-4 py-2 align-middle text-ink ${last ? '' : 'border-b border-line'} ${col.align === 'right' ? 'text-right tabular-nums' : 'text-left'} ${NOWRAP[col.nowrap] || ''} ${col.className || ''}`}
                                        >
                                            {c === 0 && href ? (
                                                <Link
                                                    to={href}
                                                    className="font-medium break-words text-ink outline-none after:absolute after:inset-0 after:content-[''] focus-visible:after:outline-2 focus-visible:after:-outline-offset-2 focus-visible:after:outline-accent"
                                                >
                                                    {content}
                                                </Link>
                                            ) : (
                                                content
                                            )}
                                        </td>
                                    );
                                })}
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}
