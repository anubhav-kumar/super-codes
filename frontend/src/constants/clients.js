/** Client directory constants (P-02). */
import { compareNumber, compareText } from '../hooks/useListSort.js';

/** The People / Companies switch shown on both client list screens. */
export const CLIENT_TABS = [
    { value: '/people', label: 'People' },
    { value: '/companies', label: 'Companies' },
];

/** Field length limits from the backend contract (section 1.5). */
export const PERSON_LIMITS = {
    name: 100,
    email: 254,
    phone: 20,
    address: 500,
    notes: 2000,
};

/** Company entity types (backend enum codes -> labels), F-03. */
export const ENTITY_TYPES = [
    { value: 'PVT_LTD', label: 'Pvt Ltd' },
    { value: 'LLP', label: 'LLP' },
    { value: 'PARTNERSHIP', label: 'Partnership' },
    { value: 'PROPRIETORSHIP', label: 'Proprietorship' },
    { value: 'OTHER', label: 'Other' },
];

/** Person-company relationship types (backend enum codes -> labels), F-03. */
export const RELATIONSHIP_TYPES = [
    { value: 'DIRECTOR', label: 'Director' },
    { value: 'PARTNER', label: 'Partner' },
    { value: 'PROPRIETOR', label: 'Proprietor' },
    { value: 'EMPLOYEE', label: 'Employee' },
    { value: 'AUTHORIZED_SIGNATORY', label: 'Authorized Signatory' },
    { value: 'ACCOUNTS_CONTACT', label: 'Accounts Contact' },
    { value: 'OTHER', label: 'Other' },
];

const labelOf = (options) => (code) => (options.find((o) => o.value === code) || {}).label || code || '';

export const entityTypeLabel = labelOf(ENTITY_TYPES);
export const relationshipLabel = labelOf(RELATIONSHIP_TYPES);

/** Company field limits from the backend contract (section 1.5 and F-03). */
export const COMPANY_LIMITS = {
    name: 100,
    gstin: 15,
    email: 254,
    phone: 20,
    address: 500,
    notes: 2000,
    associations: 20,
};

/**
 * Sort options of the People and Companies lists (F-29, useListSort). The lists arrive sorted by name,
 * and the sort is stable, so ties in outstanding stay in name order.
 */
export const CLIENT_LIST_SORTS = [
    { value: 'name', label: 'Name', compare: compareText((c) => c.name) },
    { value: '-outstanding', label: 'Outstanding', compare: compareNumber((c) => c.outstanding) },
];
