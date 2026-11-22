import { isInvoiceOpen, isOrderOpen, isOrderOverdue } from '../../utils/due.js';

/**
 * Key figures of a client profile, computed on the device from the client's own orders and the
 * invoices billed to it (F-08 data), so they also work on cached data offline.
 *   outstanding     sum of outstanding of issued invoices (draft and cancelled excluded)
 *   overdueAmount   sum of outstanding of open invoices the server flags as overdue
 *   overdueCount    number of those invoices
 *   openOrders      orders not completed or cancelled
 *   overdueOrders   open orders past their due date (device date)
 * Each part is null while its data is not loaded. Requested orders never count here.
 */
export function profileFigures(orders, invoices) {
    const result = { outstanding: null, overdueAmount: null, overdueCount: null, openOrders: null, overdueOrders: null };

    if (invoices) {
        const issued = invoices.filter((i) => i.baseStatus === 'ISSUED');
        const overdue = issued.filter((i) => isInvoiceOpen(i) && i.isOverdue);
        const sum = (list) => list.reduce((acc, i) => acc + (Number(i.outstanding) || 0), 0);
        result.outstanding = sum(issued);
        result.overdueAmount = sum(overdue);
        result.overdueCount = overdue.length;
    }
    if (orders) {
        result.openOrders = orders.filter(isOrderOpen).length;
        result.overdueOrders = orders.filter((o) => isOrderOverdue(o)).length;
    }
    return result;
}

/** Scrolls to a profile section anchor (#orders, #invoices, ...); instant when the user prefers reduced motion. */
export function scrollToSection(id) {
    const el = document.getElementById(id);
    if (!el) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    window.history.replaceState(window.history.state, '', `#${id}`);
}
