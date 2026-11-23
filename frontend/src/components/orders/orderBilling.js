// Money in paise so 0.1 + 0.2 style float noise never shows up in a figure.
const paise = (v) => {
    const n = v === null || v === undefined || v === '' ? NaN : Number(v);
    return Number.isFinite(n) ? Math.round(n * 100) : 0;
};
const sumPaise = (items, pick) => items.reduce((total, i) => total + paise(pick(i)), 0);
const hasAmount = (amount) => amount !== null && amount !== undefined && amount !== '' && Number.isFinite(Number(amount));

/**
 * The one billing rule for an order (F-44), used by order Billing, the Raise invoice button and the
 * invoice-from-order prefill. The order amount is the agreed fee before tax, so it is compared with
 * invoice amounts before tax; received and outstanding are the server's tax-inclusive figures.
 * Active invoices = not Cancelled (drafts count).
 *
 * Returns rupees: { billed, tax, draft, received, outstanding, amount, notBilled, over, share, overdue }.
 * - billed / tax / draft: sums of active `amount`, active `tax` (null counts as 0), draft `amount`.
 * - amount: the order amount, or null when it has none (₹0 is an amount).
 * - notBilled = max(0, amount − billed); over = max(0, billed − amount); both null without an amount.
 * - share (%): null without an amount or at amount 0; 100 when nothing is left; otherwise
 *   floor(billed / amount × 100) capped at 99, so it never reads 100 % while something is left.
 */
export function orderBilling(order, invoices) {
    const active = (invoices || []).filter((i) => i.baseStatus !== 'CANCELLED');
    const billedP = sumPaise(active, (i) => i.amount);
    const amountP = order && hasAmount(order.amount) ? paise(order.amount) : null;
    const notBilledP = amountP === null ? null : Math.max(0, amountP - billedP);
    let share = null;
    if (amountP !== null && amountP > 0) share = notBilledP === 0 ? 100 : Math.min(99, Math.floor((billedP * 100) / amountP));
    return {
        billed: billedP / 100,
        tax: sumPaise(active, (i) => i.tax) / 100,
        draft: sumPaise(active.filter((i) => i.baseStatus === 'DRAFT'), (i) => i.amount) / 100,
        received: sumPaise(active, (i) => i.amountReceived) / 100,
        outstanding: sumPaise(active, (i) => i.outstanding) / 100,
        amount: amountP === null ? null : amountP / 100,
        notBilled: notBilledP === null ? null : notBilledP / 100,
        over: amountP === null ? null : Math.max(0, billedP - amountP) / 100,
        share,
        overdue: active.some((i) => i.isOverdue),
    };
}
