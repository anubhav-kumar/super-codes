import { addDays, daysBetween, formatDateLong, todayLocal } from './dates.js';
import { formatDate } from './format.js';

// Due-date rules shared by rows, labels, list filters and Home counts, so every screen agrees.
//   Overdue        = due date strictly before today (device local date).
//   Due this week  = due today through today + 7 days, inclusive.

const CLOSED_ORDER_STATUSES = ['COMPLETED', 'CANCELLED'];

/** An order still needs work: status is not Completed or Cancelled. */
export function isOrderOpen(order) {
    return Boolean(order) && !CLOSED_ORDER_STATUSES.includes(order.status);
}

/** An invoice still expects money: issued and something outstanding. */
export function isInvoiceOpen(invoice) {
    return Boolean(invoice) && invoice.baseStatus === 'ISSUED' && Number(invoice.outstanding) > 0;
}

/** Open order whose due date is before today. */
export function isOrderOverdue(order, today = todayLocal()) {
    if (!isOrderOpen(order) || !order.dueDate) return false;
    const days = daysBetween(today, order.dueDate);
    return days !== null && days < 0;
}

/** Open order due from today to today + 7 days (inclusive). */
export function isOrderDueThisWeek(order, today = todayLocal()) {
    if (!isOrderOpen(order) || !order.dueDate) return false;
    const days = daysBetween(today, order.dueDate);
    return days !== null && days >= 0 && days <= 7;
}

/** Last day of the "due this week" window, "YYYY-MM-DD". */
export const dueWeekEnd = (today = todayLocal()) => addDays(today, 7);

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

/**
 * Relative due information for a label.
 *   dueInfo({ dueDate, open, overdue }) -> { kind, days, label, tone, title }
 * kind: overdue | today | soon | later | none | closed.
 * tone: danger | warning | muted | subtle (text tones, see DueLabel).
 * `overdue` is the server flag (invoices); when given it wins over the date comparison.
 * `days` is the whole days from today to the due date (negative when past), or null.
 */
export function dueInfo({ dueDate, open = true, overdue } = {}, today = todayLocal()) {
    const days = dueDate ? daysBetween(today, dueDate) : null;
    const title = dueDate ? formatDateLong(dueDate) : '';

    if (!open) {
        if (!dueDate) return { kind: 'closed', days, label: 'No due date', tone: 'subtle', title };
        return { kind: 'closed', days, label: `Due ${formatDate(dueDate, { short: true })}`, tone: 'subtle', title };
    }
    if (!dueDate || days === null) return { kind: 'none', days: null, label: 'No due date', tone: 'subtle', title };

    const isOverdue = overdue === undefined || overdue === null ? days < 0 : Boolean(overdue);
    if (isOverdue) {
        const n = Math.max(1, -days);
        return { kind: 'overdue', days, label: `Overdue ${plural(n, 'day')}`, tone: 'danger', title };
    }
    if (days === 0) return { kind: 'today', days, label: 'Due today', tone: 'warning', title };
    if (days === 1) return { kind: 'soon', days, label: 'Due tomorrow', tone: 'warning', title };
    if (days > 1 && days <= 7) return { kind: 'soon', days, label: `Due in ${days} days`, tone: 'warning', title };
    return { kind: 'later', days, label: `Due ${formatDate(dueDate, { short: true })}`, tone: 'muted', title };
}

/**
 * Sort by urgency: earliest due date first (so the most overdue come first, then the soonest),
 * items without a due date last. Compares "YYYY-MM-DD" strings, which sort as dates.
 */
export function compareByDue(a, b) {
    const da = (a && a.dueDate) || '';
    const db = (b && b.dueDate) || '';
    if (da === db) return 0;
    if (!da) return 1;
    if (!db) return -1;
    return da < db ? -1 : 1;
}
