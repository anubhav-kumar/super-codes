/** Client directory constants (P-02). */

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
