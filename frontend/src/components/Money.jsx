import { formatMoney } from '../utils/format.js';

/**
 * Amount in INR with tabular figures.
 * paise: 'auto' (default, drops ".00" on whole amounts) or 'always' (2 decimals).
 * overdue: red (only for an overdue invoice's outstanding amount). strong: semibold.
 * paidLabel: shows "Paid" in green instead of a zero amount.
 */
export default function Money({ value, paise = 'auto', overdue = false, strong = false, paidLabel = false, className = '' }) {
    if (value === null || value === undefined || value === '') {
        return <span className={`text-ink-subtle ${className}`}>—</span>;
    }
    if (paidLabel && Number(value) === 0) {
        return <span className={`font-medium text-success ${className}`}>Paid</span>;
    }
    const tone = overdue ? 'text-danger' : 'text-ink';
    return (
        <span className={`whitespace-nowrap tabular-nums ${tone} ${strong || overdue ? 'font-semibold' : ''} ${className}`}>
            {formatMoney(value, { paise })}
        </span>
    );
}
