'use strict';

/**
 * Derived invoice fields (backend plan section 3.6). Computed on every invoice read, never stored.
 * All amounts are integer paise.
 */

const { validators } = require('common');

/**
 * Returns { receivedPaise, outstandingPaise, displayedStatus, isOverdue } for an Invoices item.
 * today is YYYY-MM-DD in Asia/Kolkata (todayIst()).
 */
function deriveInvoiceStatus(item, today = validators.todayIst()) {
    const total = Number(item.totalPaise) || 0;
    const received = Number(item.receivedPaise) || 0;
    const base = item.baseStatus;
    const pastDue = item.dueDate < today;

    const outstandingPaise = base === 'ISSUED' ? Math.max(0, total - received) : 0;

    let displayedStatus;
    if (base === 'CANCELLED') displayedStatus = 'CANCELLED';
    else if (base === 'DRAFT') displayedStatus = 'DRAFT';
    else if (received >= total) displayedStatus = 'PAID';
    else if (received > 0) displayedStatus = 'PARTIALLY_PAID';
    else if (pastDue) displayedStatus = 'OVERDUE';
    else displayedStatus = 'ISSUED';

    const isOverdue = base === 'ISSUED' && received < total && pastDue;

    return { receivedPaise: received, outstandingPaise, displayedStatus, isOverdue };
}

module.exports = { deriveInvoiceStatus };
