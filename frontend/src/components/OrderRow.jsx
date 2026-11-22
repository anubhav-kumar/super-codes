import { ORDER_STATUS_TONE, orderStatusLabel } from '../constants/orders.js';
import { isOrderOpen } from '../utils/due.js';
import Badge from './Badge.jsx';
import ClientIcon from './ClientIcon.jsx';
import DueLabel from './DueLabel.jsx';
import ListRow from './ListRow.jsx';
import RecordNo from './RecordNo.jsx';

const ALL = ['client', 'service', 'owner', 'due', 'number'];

/**
 * An order as a two-line row.
 *   line 1: client (ClientIcon + name, wraps) and the status badge on the right
 *   line 2: DueLabel first (never pushed to a third line) · service · owner · ORD number
 * `show` picks the parts (a profile omits 'client', a worker page omits 'owner'); without the
 * client, the service becomes the title. `hideStatus` drops the badge (when a status filter already
 * says it). `extra` adds nodes to line 2 (e.g. <Tag>Primary owner</Tag>). `to` defaults to the order.
 */
export default function OrderRow({ order, show = ALL, hideStatus = false, extra, to }) {
    const has = (part) => show.includes(part);
    const clientName = (order.client && order.client.name) || 'Unknown client';
    const service = order.serviceName || 'Order';
    const title = has('client') ? clientName : service;

    const meta = [
        has('due') ? <DueLabel key="due" dueDate={order.dueDate} open={isOrderOpen(order)} /> : null,
        has('client') && has('service') ? order.serviceName : null,
        has('owner') && order.primaryOwner && order.primaryOwner.name ? order.primaryOwner.name : null,
        has('number') ? <RecordNo key="number">{order.orderNumber}</RecordNo> : null,
        ...(Array.isArray(extra) ? extra : extra ? [extra] : []),
    ];

    return (
        <ListRow
            to={to || `/orders/${order.id}`}
            leading={has('client') && order.client ? <ClientIcon type={order.client.type} /> : undefined}
            title={title}
            trailing={hideStatus ? undefined : <Badge tone={ORDER_STATUS_TONE[order.status]}>{orderStatusLabel(order.status)}</Badge>}
            meta={meta}
        />
    );
}
