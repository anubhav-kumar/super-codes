import { ORDER_STATUS_TONE, orderStatusLabel } from '../constants/orders.js';
import { formatDate } from '../utils/format.js';
import Badge from './Badge.jsx';
import ListItem from './ListItem.jsx';
import RecordNo from './RecordNo.jsx';

/**
 * Order rows for profile sections (F-08): number + `name(order)` as title, `detail(order)` as
 * subtitle, due date and status badge. Each row opens the order.
 */
export default function OrderRowList({ orders, name, detail, emptyText }) {
    if (orders.length === 0) return <p className="px-4 pb-4 text-sm text-ink-muted">{emptyText}</p>;
    return (
        <ul className="divide-y divide-line border-t border-line">
            {orders.map((o) => (
                <li key={o.id}>
                    <ListItem
                        to={`/orders/${o.id}`}
                        title={
                            <>
                                <span>{name(o)}</span>
                                <RecordNo className="ml-2">{o.orderNumber}</RecordNo>
                            </>
                        }
                        subtitle={detail(o) || undefined}
                        meta={o.dueDate ? `Due ${formatDate(o.dueDate)}` : undefined}
                        badges={<Badge tone={ORDER_STATUS_TONE[o.status]}>{orderStatusLabel(o.status)}</Badge>}
                    />
                </li>
            ))}
        </ul>
    );
}
