import { Fragment } from 'react';
import { Link } from 'react-router-dom';

const VALUE_TONES = { danger: 'text-danger', warning: 'text-warning', success: 'text-success' };

// Each tile is a size container, so its value can size itself to the tile's own width.
const TILE =
    '@container flex w-full min-w-0 flex-col gap-0.5 rounded-card border border-line bg-surface p-3 text-left transition md:p-4';
const INTERACTIVE = 'hover:bg-surface-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';

// [min, max] font size of a value per tile size: 'page' (Home, profiles), 'section' (order Billing).
const SIZES = {
    page: ['1rem', 'var(--text-figure)'],
    section: ['0.875rem', 'var(--text-figure-section)'],
};
const MAX_CLASS = { page: 'text-figure', section: 'text-figure-section' };

/**
 * Estimated width of a value in em (Inter tabular figures): digits and ₹ 0.64, comma, point and
 * space 0.30, anything else 0.62, plus 4 % slack.
 */
const emWidth = (text) => [...text].reduce((u, ch) => u + (/[\d₹]/.test(ch) ? 0.64 : /[,.\s]/.test(ch) ? 0.3 : 0.62), 0) * 1.04;

/** `value` as `{ text, full }` when it can be fitted (string, number or formatFigure result), else null. */
function asFigure(value) {
    if (typeof value === 'string' || typeof value === 'number') return { text: String(value), full: String(value) };
    if (value && typeof value === 'object' && typeof value.text === 'string') return { text: value.text, full: value.full || value.text };
    return null;
}

/**
 * The value of a tile. Text values shrink to fit the tile (clamp between the size's min and max,
 * from the tile width and the estimated text width) and may break only after a comma, so a value
 * never overflows its tile. A short form ("₹12.3 Cr") carries the full amount as tooltip and
 * accessible name. Any other node renders at the max size without fitting.
 */
function FigureValue({ value, size, tone }) {
    const figure = asFigure(value);
    const [min, max] = SIZES[size] || SIZES.page;
    if (!figure) return <span className={`font-semibold tabular-nums ${MAX_CLASS[size] || MAX_CLASS.page} ${tone}`}>{value}</span>;
    const { text, full } = figure;
    const shortened = full !== text;
    const parts = text.split(',');
    return (
        <span
            title={shortened ? full : undefined}
            aria-label={shortened ? full : undefined}
            className={`block font-semibold tabular-nums leading-[1.25] ${tone}`}
            style={{ fontSize: `clamp(${min}, calc(100cqi / ${Math.max(emWidth(text), 1).toFixed(2)}), ${max})` }}
        >
            {parts.map((part, i) => (
                <Fragment key={i}>
                    {part}
                    {i < parts.length - 1 && (
                        <>
                            ,<wbr />
                        </>
                    )}
                </Fragment>
            ))}
        </span>
    );
}

/**
 * One key figure: label, value (fitted to the tile, tabular), optional `sub` line.
 * `value` is a string, a number or a formatFigure() result `{ text, full }`.
 * `tone` (danger | warning | success) colors the value only when `number` is above 0 (or always
 * when `number` is not given). The whole tile is a link (`to`) or a button (`onClick`) when given.
 * `size`: 'page' (default, up to text-figure) or 'section' (up to text-figure-section).
 */
export function StatTile({ label, value, sub, tone, number, to, onClick, size = 'page', className = '' }) {
    const colored = tone && (number === undefined || number === null || Number(number) > 0);
    const content = (
        <>
            <span className="text-sm text-ink-muted md:text-[13px]/[18px]">{label}</span>
            <FigureValue value={value} size={size} tone={colored ? VALUE_TONES[tone] || 'text-ink' : 'text-ink'} />
            {sub && <span className="text-xs text-ink-muted">{sub}</span>}
        </>
    );
    if (to) {
        return (
            <Link to={to} className={`${TILE} ${INTERACTIVE} ${className}`}>
                {content}
            </Link>
        );
    }
    if (onClick) {
        return (
            <button type="button" onClick={onClick} className={`${TILE} ${INTERACTIVE} ${className}`}>
                {content}
            </button>
        );
    }
    return <div className={`${TILE} ${className}`}>{content}</div>;
}

// Columns follow the width the figures get (container queries on the wrapper), not the viewport.
const GRID = {
    1: 'grid-cols-1',
    2: 'grid-cols-2',
    3: 'grid-cols-2 @min-[30rem]:grid-cols-3',
    4: 'grid-cols-2 @min-[40rem]:grid-cols-4',
};

/**
 * 1 to 4 key figures. items: [{ key, label, value, sub, tone, number, to, onClick }].
 * 4 items: 2 x 2, one row of 4 from a 40rem wide container. 3 items: 2 + 1 (the third spans both
 * columns), one row of 3 from 30rem. 2 items: 2 columns. `size` = 'page' | 'section' (StatTile).
 * The wrapper is a size container: never place it in an auto / max-content grid track or a
 * shrink-to-fit box, it has no intrinsic width.
 */
export default function KeyFigures({ items = [], size = 'page', className = '' }) {
    const list = items.filter(Boolean);
    const three = list.length === 3;
    return (
        <div className={`@container ${className}`}>
            <div className={`grid gap-2 md:gap-3 ${GRID[list.length] || GRID[4]}`}>
                {list.map((item, i) => (
                    <StatTile
                        key={item.key || item.label}
                        {...item}
                        size={size}
                        className={three && i === 2 ? 'col-span-2 @min-[30rem]:col-span-1' : ''}
                    />
                ))}
            </div>
        </div>
    );
}
