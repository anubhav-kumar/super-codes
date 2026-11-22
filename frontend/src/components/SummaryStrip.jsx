import MetaLine from './MetaLine.jsx';

const TONES = { danger: 'text-danger', warning: 'text-warning', success: 'text-success' };

/**
 * One quiet line above a list: "Outstanding ₹8,108 · Overdue ₹7,700 (1)". Wraps by item on narrow
 * phones, never leaving a "·" at the start or end of a line (MetaLine).
 * items: [{ label, value, tone }] (falsy items skipped); `tone` colors the value only.
 */
export default function SummaryStrip({ items = [], className = '' }) {
    const list = items.filter(Boolean);
    if (list.length === 0) return null;
    return (
        <MetaLine
            as="p"
            className={`text-sm text-ink-muted ${className}`}
            items={list.map((item) => (
                <span key={item.label} className="whitespace-nowrap">
                    {item.label} <span className={`font-semibold tabular-nums ${TONES[item.tone] || 'text-ink'}`}>{item.value}</span>
                </span>
            ))}
        />
    );
}
