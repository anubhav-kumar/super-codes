/** Order option lists, labels and limits (P-04, F-05). Backend enums are uppercase codes. */

export const ORDER_STATUSES = [
    { value: 'NEW', label: 'New' },
    { value: 'ACCEPTED', label: 'Accepted' },
    { value: 'IN_PROGRESS', label: 'In Progress' },
    { value: 'COMPLETED', label: 'Completed' },
    { value: 'ON_HOLD', label: 'On Hold' },
    { value: 'CANCELLED', label: 'Cancelled' },
];

export const ORDER_STATUS_TONE = {
    NEW: 'info',
    ACCEPTED: 'info',
    IN_PROGRESS: 'warning',
    COMPLETED: 'success',
    ON_HOLD: 'neutral',
    CANCELLED: 'neutral',
};

/** List filter options; "ALL" is the unfiltered list (read from / written to ?status=). */
export const ORDER_FILTERS = [{ value: 'ALL', label: 'All' }, ...ORDER_STATUSES];

/** Suggestions for the free-text service name. */
export const SERVICE_SUGGESTIONS = [
    'Income Tax Return Filing',
    'GST Return Filing',
    'Company Incorporation',
    'ROC Compliance',
    'Audit',
    'Accounting Services',
    'Tax Audit',
    'TDS Return Filing',
];

/** Field limits from the backend contract (section 1.5 and F-05). */
export const ORDER_LIMITS = {
    serviceName: 100,
    description: 2000,
    notes: 2000,
    assignments: 20,
    maxAmount: 9999999999.99,
};

const labelOf = (options) => (value) => (options.find((o) => o.value === value) || {}).label || value || '';

export const orderStatusLabel = labelOf(ORDER_STATUSES);

/** Detail path of an order client ({ type: 'PERSON' | 'COMPANY', id }). */
export const clientPath = (client) =>
    !client || !client.id ? null : client.type === 'COMPANY' ? `/companies/${client.id}` : `/people/${client.id}`;
