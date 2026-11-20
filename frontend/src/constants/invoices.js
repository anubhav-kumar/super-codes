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
