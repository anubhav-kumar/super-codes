/** Invoice option lists, labels and limits (P-05, F-06). Backend enums are uppercase codes. */

/** Base status: stored and set by staff. New invoices are DRAFT. */
export const INVOICE_BASE_STATUSES = [
    { value: 'DRAFT', label: 'Draft' },
    { value: 'ISSUED', label: 'Issued' },
    { value: 'CANCELLED', label: 'Cancelled' },
];

/** Displayed status: derived by the server from base status, payments and due date. */
export const INVOICE_DISPLAYED_STATUSES = [
    { value: 'DRAFT', label: 'Draft' },
    { value: 'ISSUED', label: 'Issued' },
    { value: 'PARTIALLY_PAID', label: 'Partially Paid' },
    { value: 'PAID', label: 'Paid' },
    { value: 'OVERDUE', label: 'Overdue' },
    { value: 'CANCELLED', label: 'Cancelled' },
];

export const INVOICE_STATUS_TONE = {
    DRAFT: 'neutral',
    CANCELLED: 'neutral',
    ISSUED: 'info',
    PARTIALLY_PAID: 'warning',
    PAID: 'success',
    OVERDUE: 'danger',
};

/**
 * List filters (read from / written to ?filter=). Each tests server-derived fields only; the
 * device never recomputes received, outstanding or overdue.
 */
export const INVOICE_FILTERS = [
    { value: 'all', label: 'All', test: () => true },
    { value: 'unpaid', label: 'Unpaid', test: (i) => i.baseStatus === 'ISSUED' && Number(i.outstanding) > 0 },
    { value: 'overdue', label: 'Overdue', test: (i) => Boolean(i.isOverdue) },
    { value: 'draft', label: 'Draft', test: (i) => i.baseStatus === 'DRAFT' },
    { value: 'paid', label: 'Paid', test: (i) => i.displayedStatus === 'PAID' },
    { value: 'cancelled', label: 'Cancelled', test: (i) => i.baseStatus === 'CANCELLED' },
];

/** Field limits from the backend contract (section 1.5 and F-06). */
export const INVOICE_LIMITS = {
    description: 2000,
    maxAmount: 9999999999.99,
};

const labelOf = (options) => (value) => (options.find((o) => o.value === value) || {}).label || value || '';

export const invoiceStatusLabel = labelOf(INVOICE_DISPLAYED_STATUSES);

/** Partially paid and past due: shown with an extra "Overdue" marker next to the status badge. */
export const showsOverdueMarker = (invoice) => Boolean(invoice && invoice.isOverdue && invoice.displayedStatus !== 'OVERDUE');

// ---- Invoices list (P-12, F-24): sort options, chip counts and the summary strip ----

const paise = (value) => Math.round(Number(value || 0) * 100);

/** Urgency group for the Due sort: overdue, then other open, then draft, then paid / cancelled. */
function dueRank(invoice) {
    const open = invoice.baseStatus === 'ISSUED' && Number(invoice.outstanding) > 0;
    if (open && invoice.isOverdue) return 0;
    if (open) return 1;
    if (invoice.baseStatus === 'DRAFT') return 2;
    return 3;
}

/**
 * Due order: overdue first (most days overdue first), then open invoices by soonest due date, then
 * drafts, then paid and cancelled. No due date sorts last within its group.
 */
export function compareInvoicesByDue(a, b) {
    const rank = dueRank(a) - dueRank(b);
    if (rank !== 0) return rank;
    const da = a.dueDate || '';
    const db = b.dueDate || '';
    if (da !== db) {
        if (!da) return 1;
        if (!db) return -1;
        return da < db ? -1 : 1;
    }
    return String(a.invoiceNumber || '').localeCompare(String(b.invoiceNumber || ''));
}

const compareAmount = (pick) => (a, b) => paise(pick(a)) - paise(pick(b)) || String(a.invoiceNumber || '').localeCompare(String(b.invoiceNumber || ''));

/**
 * Sort options for useListSort (?sort=). `value` is the default direction (minus = descending).
 * `tableOnly` options are sortable from the desktop table headers but not offered in the phone menu.
 */
export const INVOICE_SORTS = [
    { value: 'due', label: 'Due date', compare: compareInvoicesByDue },
    {
        value: '-invoiceDate',
        label: 'Invoice date',
        compare: (a, b) =>
            String(a.invoiceDate || '').localeCompare(String(b.invoiceDate || '')) ||
            String(a.invoiceNumber || '').localeCompare(String(b.invoiceNumber || '')),
    },
    { value: '-outstanding', label: 'Outstanding', compare: compareAmount((i) => i.outstanding) },
    { value: '-total', label: 'Total', compare: compareAmount((i) => i.total), tableOnly: true },
];

export const DEFAULT_INVOICE_SORT = 'due';

/** Count of invoices per list filter: { all: 5, unpaid: 2, overdue: 1, ... }. */
export function invoiceFilterCounts(invoices) {
    const counts = {};
    for (const f of INVOICE_FILTERS) counts[f.value] = 0;
    for (const invoice of invoices || []) {
        for (const f of INVOICE_FILTERS) if (f.test(invoice)) counts[f.value] += 1;
    }
    return counts;
}

/**
 * Totals for the summary strip, from the server's per-invoice values only:
 * outstanding = sum of outstanding of open invoices (issued, something owed);
 * overdue = sum and count of the open invoices the server flags as overdue.
 */
export function invoiceTotals(invoices) {
    let outstanding = 0;
    let overdue = 0;
    let overdueCount = 0;
    let openCount = 0;
    for (const invoice of invoices || []) {
        if (invoice.baseStatus !== 'ISSUED' || !(Number(invoice.outstanding) > 0)) continue;
        const owed = paise(invoice.outstanding);
        outstanding += owed;
        openCount += 1;
        if (invoice.isOverdue) {
            overdue += owed;
            overdueCount += 1;
        }
    }
    return { outstanding: outstanding / 100, overdue: overdue / 100, overdueCount, openCount };
}

/** Displayed statuses a filter chip already implies, so the row badge can be hidden. */
export const INVOICE_FILTER_IMPLIED_STATUS = {
    unpaid: ['ISSUED'],
    overdue: ['OVERDUE'],
    draft: ['DRAFT'],
    paid: ['PAID'],
    cancelled: ['CANCELLED'],
};
