import NoWorkerState from '../NoWorkerState.jsx';
import Section from '../Section.jsx';
import MemberFigures from './MemberFigures.jsx';
import NeedsAttention from './NeedsAttention.jsx';
import OrderStatusCounts from './OrderStatusCounts.jsx';

/**
 * The member's own order data from a summary. Only a member-scope summary is used: a firm summary
 * (e.g. an admin's cached copy) counts as empty, so firm figures never reach a member. Invoice
 * fields are dropped (firm money is admin only).
 */
export function memberOrders(summary) {
    if (!summary || summary.scope === 'FIRM') return { orders: {}, overdueOrders: [] };
    return { orders: summary.orders || {}, overdueOrders: summary.overdueOrders || [] };
}

/** Member Home figures (P-26 F-58): their own order counts (zeros without a linked Worker). */
export function MemberHomeFigures({ summary, hasWorker }) {
    const { orders } = memberOrders(summary);
    return <MemberFigures orders={hasWorker ? orders : {}} />;
}

/**
 * Member Home main column (P-26 F-58): "Needs attention" (their overdue orders only) and
 * "My orders by status". Without a linked Worker: NoWorkerState instead.
 */
export default function MemberHome({ summary, hasWorker }) {
    if (!hasWorker) {
        return (
            <Section>
                <NoWorkerState />
            </Section>
        );
    }
    const { orders, overdueOrders } = memberOrders(summary);
    return (
        <div className="flex flex-col gap-4 lg:gap-6">
            <NeedsAttention summary={{ orders: { overdueCount: orders.overdueCount }, overdueOrders, overdueInvoices: [] }} />
            <OrderStatusCounts byStatus={orders.byStatus} />
        </div>
    );
}
