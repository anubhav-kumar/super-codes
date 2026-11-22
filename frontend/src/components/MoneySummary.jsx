import { formatMoney, hasPaise } from '../utils/format.js';

const TONES = {
    neutral: 'text-ink',
    success: 'text-success',
    warning: 'text-warning',
    danger: 'text-danger',
};

function Row({ label, value, paise, tone = 'neutral', strong = false, muted = false, hint, className = '' }) {
    return (
        <div className={`flex items-baseline justify-between gap-3 py-1 ${className}`}>
            <dt className={`text-sm ${strong ? 'font-medium text-ink' : 'text-ink-muted'}`}>
                {label}
                {hint && <span className="block text-xs font-normal text-ink-muted">{hint}</span>}
            </dt>
            <dd
                className={`whitespace-nowrap tabular-nums ${strong ? 'text-base font-semibold' : 'text-sm'} ${
                    muted ? 'text-ink-muted' : TONES[tone] || TONES.neutral
                }`}
            >
                {value === null || value === undefined ? '—' : formatMoney(value, { paise })}
            </dd>
        </div>
    );
}

/**
 * Money block of the invoice detail (F-07, restyled in F-25): Amount and Tax (quiet), Total, then
 * Received and Outstanding (bold) under a hairline. Every value comes from the server; nothing is
 * recomputed on the device. `amount` and `tax` rows show only when given.
 * outstandingTone: neutral | success | warning | danger (the invoice screen uses danger only when
 * overdue). `outstandingHint` explains a zero outstanding on a draft or cancelled invoice.
 * One decimal decision per summary (F-31): if any shown value has non-zero paise, every line shows
 * 2 decimals; otherwise every line shows whole rupees.
 */
export default function MoneySummary({ amount, tax, total, received, outstanding, outstandingTone = 'neutral', outstandingHint, title, className = '' }) {
    const hasParts = amount !== undefined || tax !== undefined;
    const paise = [amount, tax, total, received, outstanding].some(hasPaise) ? 'always' : 'none';
    return (
        <section className={`rounded-card border border-line bg-surface px-4 py-3 ${className}`}>
            {title && <h2 className="mb-2 text-base font-semibold text-ink">{title}</h2>}
            <dl>
                {amount !== undefined && <Row label="Amount" value={amount} paise={paise} muted />}
                {tax !== undefined && <Row label="Tax" value={tax} paise={paise} muted />}
                <Row label="Total" value={total} paise={paise} strong className={hasParts ? 'mt-1 border-t border-line pt-2' : ''} />
                <Row label="Received" value={received} paise={paise} className="mt-1 border-t border-line pt-2" />
                <Row label="Outstanding" value={outstanding} paise={paise} tone={outstandingTone} strong hint={outstandingHint} />
            </dl>
        </section>
    );
}
