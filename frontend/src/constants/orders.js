/** Order option lists, labels and limits (P-04, F-05). Backend enums are uppercase codes. */
import { compareByDue, isOrderDueThisWeek, isOrderOverdue } from '../utils/due.js';

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

/**
 * Orders list chips (F-22): All, Overdue, Due this week, then one per status.
 * `param` is the URL query the chip writes (?filter=overdue, ?filter=due-week, ?status=IN_PROGRESS),
 * `test(order, today)` decides membership (call it with today, never pass it straight to .filter),
 * `status` is set on status chips so the list can hide the badge the chip already implies.
 * Overdue / Due this week use the shared due.js rules, so Home counts and this list agree.
 */
export const ORDER_LIST_FILTERS = [
    { value: 'ALL', label: 'All', param: null, test: () => true },
    { value: 'overdue', label: 'Overdue', tone: 'danger', param: ['filter', 'overdue'], test: (o, today) => isOrderOverdue(o, today) },
    { value: 'due-week', label: 'Due this week', param: ['filter', 'due-week'], test: (o, today) => isOrderDueThisWeek(o, today) },
    ...ORDER_STATUSES.map((s) => ({ value: s.value, label: s.label, status: s.value, param: ['status', s.value], test: (o) => o.status === s.value })),
];

/** The chip for the current URL: ?filter= wins over ?status=; unknown values fall back to All. */
export function orderListFilterFromParams(params) {
    const filter = params.get('filter');
    const status = params.get('status');
    const match = (key, value) => ORDER_LIST_FILTERS.find((f) => f.param && f.param[0] === key && f.param[1] === value);
    return (filter && match('filter', filter)) || (status && match('status', status)) || ORDER_LIST_FILTERS[0];
}

// Ascending compares; an empty value counts as the lowest, so the default descending sorts
// (-orderDate, -amount) keep empty values last.
const amountOf = (o) => {
    const n = o.amount === null || o.amount === undefined || o.amount === '' ? NaN : Number(o.amount);
    return Number.isFinite(n) ? n : -Infinity;
};
const amountAsc = (a, b) => {
    const x = amountOf(a);
    const y = amountOf(b);
    return x === y ? 0 : x < y ? -1 : 1;
};
const textAsc = (pick) => (a, b) => String(pick(a) || '').localeCompare(String(pick(b) || ''), undefined, { sensitivity: 'base', numeric: true });

/**
 * Orders list sorts for useListSort (?sort=). `menu` marks the ones offered in the phone sort menu;
 * number and client are table-header sorts only. Default: 'due' (overdue first, then soonest, no due date last).
 */
export const ORDER_SORTS = [
    { value: 'due', label: 'Due date', menu: true, compare: compareByDue },
    { value: '-orderDate', label: 'Order date', menu: true, compare: textAsc((o) => o.orderDate) },
    { value: '-amount', label: 'Amount', menu: true, compare: amountAsc },
    { value: 'number', label: 'Order number', compare: textAsc((o) => o.orderNumber) },
    { value: 'client', label: 'Client', compare: textAsc((o) => o.client && o.client.name) },
];

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
