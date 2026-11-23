/**
 * Settled invoice (F-37): nothing more to collect. Cancelled, or issued with the server's outstanding
 * at or below 0 (displayed status Paid). Uses server values only, never a sum made on the device.
 */
export function isInvoiceSettled(invoice) {
    if (!invoice) return false;
    if (invoice.baseStatus === 'CANCELLED') return true;
    return invoice.baseStatus === 'ISSUED' && Number(invoice.outstanding) <= 0;
}

/** A fully paid invoice (issued, nothing outstanding). Cancelled invoices are settled but not paid. */
export function isInvoicePaid(invoice) {
    return Boolean(invoice) && invoice.baseStatus === 'ISSUED' && Number(invoice.outstanding) <= 0;
}

/** Latest `paymentDate` (YYYY-MM-DD) among the invoice's Paid payments, or null when none has one. */
export function lastPaidDate(invoice) {
    const payments = invoice && Array.isArray(invoice.payments) ? invoice.payments : [];
    let latest = null;
    for (const p of payments) {
        if (p.status !== 'PAID' || !p.paymentDate) continue;
        if (latest === null || p.paymentDate > latest) latest = p.paymentDate;
    }
    return latest;
}
