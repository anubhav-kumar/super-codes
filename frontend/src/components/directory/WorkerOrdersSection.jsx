import { useMemo, useState } from 'react';
import DataView from '../DataView.jsx';
import Icon from '../Icon.jsx';
import OrderRow from '../OrderRow.jsx';
import Section from '../Section.jsx';
import Tag from '../Tag.jsx';
import { useWorkerOrders } from '../../hooks/useWorkers.js';
import { compareByDue, isOrderOpen } from '../../utils/due.js';

const ROW_PARTS = ['client', 'service', 'due', 'number'];

const TOGGLE_CLASS =
    'flex min-h-11 w-full items-center justify-center gap-1.5 px-4 text-sm font-medium text-ink-muted transition hover:bg-surface-subtle hover:text-ink focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent md:min-h-10';

function closedLabel(closed) {
    const allCompleted = closed.every((o) => o.status === 'COMPLETED');
    return `${allCompleted ? 'completed' : 'closed'} (${closed.length})`;
}

function OrderList({ orders }) {
    return (
        <ul className="divide-y divide-line border-t border-line">
            {orders.map((o) => (
                <li key={o.id}>
                    <OrderRow order={o} show={ROW_PARTS} extra={o.assignment && o.assignment.isPrimary ? <Tag key="primary">Primary owner</Tag> : null} />
                </li>
            ))}
        </ul>
    );
}

/**
 * Orders section of worker detail (F-30): the worker's orders (primary or not) as OrderRows without
 * the owner. Open orders first, most urgent due date first; completed and cancelled orders stay
 * behind "Show completed (N)", newest first (server order).
 */
export default function WorkerOrdersSection({ workerId }) {
    const orders = useWorkerOrders(workerId);
    const [showClosed, setShowClosed] = useState(false);
    const all = orders.data;

    const { open, closed } = useMemo(() => {
        const list = Array.isArray(all) ? all : [];
        return {
            open: list.filter(isOrderOpen).sort(compareByDue),
            closed: list.filter((o) => !isOrderOpen(o)),
        };
    }, [all]);

    const loaded = Array.isArray(all);
    const footer =
        loaded && closed.length > 0 ? (
            <button type="button" className={TOGGLE_CLASS} aria-expanded={showClosed} onClick={() => setShowClosed((v) => !v)}>
                <Icon name="chevron-down" size="sm" className={showClosed ? 'rotate-180' : ''} />
                {showClosed ? 'Hide' : 'Show'} {closedLabel(closed)}
            </button>
        ) : null;

    return (
        <Section id="orders" title="Orders" count={loaded ? open.length : undefined} footer={footer}>
            <DataView resource={orders} compact>
                {() =>
                    open.length === 0 && closed.length === 0 ? (
                        <p className="px-4 pb-4 text-sm text-ink-muted">No orders assigned yet.</p>
                    ) : (
                        <>
                            {open.length > 0 ? <OrderList orders={open} /> : <p className="px-4 pb-4 text-sm text-ink-muted">No open orders.</p>}
                            {showClosed && closed.length > 0 && <OrderList orders={closed} />}
                        </>
                    )
                }
            </DataView>
        </Section>
    );
}
