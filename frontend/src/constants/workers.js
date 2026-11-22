import { compareNumber, compareText } from '../hooks/useListSort.js';

/** Worker option lists and labels (backend enums are uppercase codes). */

export const DESIGNATIONS = [
    { value: 'ARTICLE', label: 'Article' },
    { value: 'ASSOCIATE', label: 'Associate' },
    { value: 'TRAINEE', label: 'Trainee' },
    { value: 'MANAGER', label: 'Manager' },
    { value: 'OTHER', label: 'Other' },
];

export const WORKER_STATUSES = [
    { value: 'ACTIVE', label: 'Active' },
    { value: 'INACTIVE', label: 'Inactive' },
];

export const WORKER_STATUS_TONE = { ACTIVE: 'success', INACTIVE: 'neutral' };

/** List filter options; "ALL" is the unfiltered list. */
export const WORKER_FILTERS = [...WORKER_STATUSES, { value: 'ALL', label: 'All' }];

const labelOf = (options) => (value) => (options.find((o) => o.value === value) || {}).label || value || '';

export const designationLabel = labelOf(DESIGNATIONS);
export const workerStatusLabel = labelOf(WORKER_STATUSES);

/**
 * Sort options of the Workers list (F-30, useListSort). The list arrives sorted by name and the sort
 * is stable, so workers with the same open order count stay in name order.
 */
export const WORKER_LIST_SORTS = [
    { value: 'name', label: 'Name', compare: compareText((w) => w.name) },
    { value: '-openOrders', label: 'Open orders', compare: compareNumber((w) => w.openOrderCount) },
];
