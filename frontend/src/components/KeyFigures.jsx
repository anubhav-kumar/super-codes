import { Link } from 'react-router-dom';

const VALUE_TONES = { danger: 'text-danger', warning: 'text-warning', success: 'text-success' };

const TILE =
    'flex min-w-0 flex-col gap-0.5 rounded-card border border-line bg-surface p-3 text-left transition md:p-4';
const INTERACTIVE = 'hover:bg-surface-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';

/**
 * One key figure: label, big value (text-figure, tabular), optional `sub` line.
 * `tone` (danger | warning | success) colors the value only when `number` is above 0 (or always
 * when `number` is not given). The whole tile is a link (`to`) or a button (`onClick`) when given.
 */
export function StatTile({ label, value, sub, tone, number, to, onClick, compact = false }) {
    const colored = tone && (number === undefined || number === null || Number(number) > 0);
    const content = (
        <>
            <span className="text-sm text-ink-muted md:text-[13px]/[18px]">{label}</span>
            <span
                className={`font-semibold tabular-nums ${compact ? 'text-lg md:text-figure' : 'text-figure'} ${colored ? VALUE_TONES[tone] || 'text-ink' : 'text-ink'}`}
            >
                {value}
            </span>
            {sub && <span className="text-xs text-ink-muted">{sub}</span>}
        </>
    );
    if (to) {
        return (
            <Link to={to} className={`${TILE} ${INTERACTIVE}`}>
                {content}
            </Link>
        );
    }
    if (onClick) {
        return (
            <button type="button" onClick={onClick} className={`${TILE} ${INTERACTIVE}`}>
                {content}
            </button>
        );
    }
    return <div className={TILE}>{content}</div>;
}

const MD_COLS = { 1: 'md:grid-cols-1', 2: 'md:grid-cols-2', 3: 'md:grid-cols-3', 4: 'md:grid-cols-4' };

/**
 * 2 to 4 key figures. items: [{ key, label, value, sub, tone, number, to, onClick }].
 * Phones: 2 columns (3 items: 3 compact columns); md+: one row.
 */
export default function KeyFigures({ items = [], className = '' }) {
    const list = items.filter(Boolean);
    const three = list.length === 3;
    return (
        <div className={`grid gap-2 md:gap-3 ${three ? 'grid-cols-3' : 'grid-cols-2'} ${MD_COLS[list.length] || 'md:grid-cols-4'} ${className}`}>
            {list.map((item) => (
                <StatTile key={item.key || item.label} {...item} compact={three} />
            ))}
        </div>
    );
}
