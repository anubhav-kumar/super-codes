import { Fragment } from 'react';

const TONES = { danger: 'text-danger', warning: 'text-warning', success: 'text-success' };

/**
 * One quiet line above a list: "Outstanding ₹8,108 · Overdue ₹7,700 (1)". Wraps on narrow phones.
 * items: [{ label, value, tone }] (falsy items skipped); `tone` colors the value only.
 */
export default function SummaryStrip({ items = [], className = '' }) {
    const list = items.filter(Boolean);
    if (list.length === 0) return null;
    return (
        <p className={`flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-ink-muted ${className}`}>
            {list.map((item, i) => (
                <Fragment key={item.label}>
                    {i > 0 && (
                        <span aria-hidden="true" className="text-ink-subtle">
                            ·
                        </span>
                    )}
                    <span className="whitespace-nowrap">
                        {item.label} <span className={`font-semibold tabular-nums ${TONES[item.tone] || 'text-ink'}`}>{item.value}</span>
                    </span>
                </Fragment>
            ))}
        </p>
    );
}
