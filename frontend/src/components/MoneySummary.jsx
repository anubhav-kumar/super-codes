import { formatMoney } from '../utils/format.js';

const TONES = {
    neutral: 'text-ink',
    success: 'text-success',
    warning: 'text-warning',
    danger: 'text-danger',
};

function Row({ label, value, tone = 'neutral', strong = false, hint }) {
    return (
        <div className="flex items-baseline justify-between gap-3 py-1.5">
            <dt className="text-sm text-ink-muted">
                {label}
                {hint && <span className="block text-xs">{hint}</span>}
            </dt>
            <dd className={`tabular-nums ${strong ? 'text-base font-semibold' : 'text-sm'} ${TONES[tone] || TONES.neutral}`}>
                {value === null || value === undefined ? '—' : formatMoney(value)}
            </dd>
        </div>
    );
}

/**
 * Total / received / outstanding block (F-07). Every value comes from the server; nothing is
 * recomputed on the device. `amount` and `tax` rows show only when given.
 * outstandingTone: neutral | success | warning | danger. `outstandingHint` explains a zero
 * outstanding on a draft or cancelled invoice.
 */
export default function MoneySummary({ amount, tax, total, received, outstanding, outstandingTone = 'neutral', outstandingHint, title, className = '' }) {
    return (
        <section className={`rounded-card border border-line bg-surface p-4 ${className}`}>
            {title && <h2 className="mb-2 text-base font-semibold text-ink">{title}</h2>}
            <dl className="divide-y divide-line">
                {amount !== undefined && <Row label="Amount" value={amount} />}
                {tax !== undefined && <Row label="Tax" value={tax} />}
                <Row label="Total" value={total} strong />
                <Row label="Received" value={received} />
                <Row label="Outstanding" value={outstanding} tone={outstandingTone} strong hint={outstandingHint} />
            </dl>
        </section>
    );
}
