import { dueInfo } from '../utils/due.js';
import Icon from './Icon.jsx';

const TONES = {
    danger: 'font-medium text-danger',
    warning: 'font-medium text-warning',
    muted: 'text-ink-muted',
    subtle: 'text-ink-subtle',
};

const ICONS = { overdue: 'overdue', today: 'due-soon', soon: 'due-soon', later: 'due', none: 'due', closed: 'due' };

/**
 * Relative due label: "Overdue 3 days" (red), "Due today" / "Due in 4 days" (amber),
 * "Due 25 Nov" (gray), "No due date". Icon + text, so it never relies on color alone; the full
 * date is in the hover title.
 *   <DueLabel dueDate={o.dueDate} open={isOrderOpen(o)} />
 *   <DueLabel dueDate={i.dueDate} open={isInvoiceOpen(i)} overdue={i.isOverdue} />   (server flag wins)
 * `compact` drops the icon (tables).
 */
export default function DueLabel({ dueDate, open = true, overdue, compact = false, className = '' }) {
    const info = dueInfo({ dueDate, open, overdue });
    return (
        <span title={info.title || undefined} className={`inline-flex items-center gap-1 whitespace-nowrap tabular-nums ${TONES[info.tone] || TONES.muted} ${className}`}>
            {!compact && <Icon name={ICONS[info.kind]} size="sm" className="shrink-0" />}
            {info.label}
        </span>
    );
}
