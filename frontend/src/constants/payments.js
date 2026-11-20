/** Payment option lists, labels and limits (P-05, F-07). Backend enums are uppercase codes. */

export const PAYMENT_STATUSES = [
    { value: 'CREATED', label: 'Created' },
    { value: 'SENT', label: 'Sent' },
    { value: 'PAID', label: 'Paid' },
    { value: 'FAILED', label: 'Failed' },
    { value: 'EXPIRED', label: 'Expired' },
    { value: 'CANCELLED', label: 'Cancelled' },
];

export const PAYMENT_STATUS_TONE = {
    CREATED: 'neutral',
    CANCELLED: 'neutral',
    SENT: 'info',
    EXPIRED: 'warning',
    PAID: 'success',
    FAILED: 'danger',
};

/** Field limits from the backend contract (section 1.5 and F-07). */
export const PAYMENT_LIMITS = {
    link: 500,
    transactionReference: 200,
    maxAmount: 9999999999.99,
};

export const paymentStatusLabel = (value) => (PAYMENT_STATUSES.find((o) => o.value === value) || {}).label || value || '';
