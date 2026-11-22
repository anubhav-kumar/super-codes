import { Link, useParams } from 'react-router-dom';
import Badge from '../components/Badge.jsx';
import Button from '../components/Button.jsx';
import Card from '../components/Card.jsx';
import ClientIcon from '../components/ClientIcon.jsx';
import DataView from '../components/DataView.jsx';
import DetailField from '../components/DetailField.jsx';
import DueLabel from '../components/DueLabel.jsx';
import OrderInvoicesSection from '../components/OrderInvoicesSection.jsx';
import OfflineActionHint from '../components/OfflineActionHint.jsx';
import PageBody from '../components/PageBody.jsx';
import PageHeader from '../components/PageHeader.jsx';
import RecordHeader from '../components/RecordHeader.jsx';
import RecordNo from '../components/RecordNo.jsx';
import RelatedSection from '../components/RelatedSection.jsx';
import SelectField from '../components/SelectField.jsx';
import { orderUpdateBody, updateOrder } from '../api/orders.js';
import { clientPath, ORDER_STATUSES, ORDER_STATUS_TONE, orderStatusLabel } from '../constants/orders.js';
import useOnlineStatus from '../hooks/useOnlineStatus.js';
import { useOrder } from '../hooks/useOrders.js';
import useInlineSave from '../hooks/useInlineSave.js';
import { isOrderOpen } from '../utils/due.js';
import { formatDate, formatMoney } from '../utils/format.js';
import Tag from '../components/Tag.jsx';

const linkClass = 'text-ink underline-offset-2 hover:underline focus-visible:underline';

function StatusChanger({ order, onSaved }) {
    const { online } = useOnlineStatus();
    const status = useInlineSave(order.status);

    // Optimistic: the select shows the new status at once and rolls back with an error toast on failure.
    // PUT needs the full field set; everything except status is sent back as loaded.
    const change = async (next) => {
        if (!next || next === status.value) return;
        const result = await status.save(next, () => updateOrder(order.id, orderUpdateBody(order, { status: next })), {
            success: `Status changed to ${orderStatusLabel(next)}`,
        });
        if (result.ok) onSaved();
    };

    return (
        <SelectField
            label="Change status"
            options={ORDER_STATUSES}
            value={status.value}
            onChange={change}
            disabled={!online || status.saving}
            hint={status.saving ? 'Saving…' : undefined}
        />
    );
}

function AssignmentsSection({ assignments }) {
    return (
        <RelatedSection title="Assigned workers" count={assignments.length} className="mt-4">
            {assignments.length === 0 ? (
                <p className="px-4 pb-4 text-sm text-ink-muted">No workers assigned.</p>
            ) : (
                <ul className="divide-y divide-line border-t border-line">
                    {assignments.map((a) => (
                        <li key={a.workerId}>
                            <Link
                                to={`/workers/${a.workerId}`}
                                className="flex min-h-14 items-center gap-3 px-4 py-3 transition hover:bg-surface-subtle focus-visible:bg-surface-subtle focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
                            >
                                <span className="min-w-0 flex-1">
                                    <span className="block truncate font-medium text-ink">{a.workerName || 'Unknown worker'}</span>
                                    {a.assignedDate && (
                                        <span className="block text-sm text-ink-muted">Assigned {formatDate(a.assignedDate)}</span>
                                    )}
                                </span>
                                <span className="flex shrink-0 flex-wrap justify-end gap-1">
                                    {a.isPrimary && <Tag>Primary owner</Tag>}
                                    {a.workerStatus === 'INACTIVE' && <Badge>Inactive</Badge>}
                                </span>
                            </Link>
                        </li>
                    ))}
                </ul>
            )}
        </RelatedSection>
    );
}

function OrderDetail({ order, reload }) {
    const { online } = useOnlineStatus();
    const toClient = clientPath(order.client);
    const clientName = (order.client && order.client.name) || 'Unknown client';
    const receivedName = (order.receivedFrom && order.receivedFrom.name) || 'Unknown person';

    return (
        <>
            <RecordHeader
                eyebrow={<RecordNo>{order.orderNumber}</RecordNo>}
                title={order.serviceName || order.orderNumber}
                subtitle={
                    order.client ? (
                        <span className="inline-flex items-center gap-1.5">
                            <ClientIcon type={order.client.type} size="inline" />
                            {toClient ? (
                                <Link to={toClient} className={linkClass}>
                                    {clientName}
                                </Link>
                            ) : (
                                clientName
                            )}
                        </span>
                    ) : null
                }
                meta={[
                    <Badge key="status" tone={ORDER_STATUS_TONE[order.status]}>
                        {orderStatusLabel(order.status)}
                    </Badge>,
                    <DueLabel key="due" dueDate={order.dueDate} open={isOrderOpen(order)} />,
                ]}
                actions={
                    <Button variant="secondary" icon="edit" to={`/orders/${order.id}/edit`} disabled={!online}>
                        Edit
                    </Button>
                }
            >
                {!online && <OfflineActionHint />}
            </RecordHeader>
            <Card>
                <dl className="grid gap-4 md:grid-cols-2">
                    <DetailField label="Received from">
                        {order.receivedFrom && order.receivedFrom.id ? (
                            <Link to={`/people/${order.receivedFrom.id}`} className={linkClass}>
                                {receivedName}
                            </Link>
                        ) : null}
                    </DetailField>
                    <DetailField label="Order date" value={formatDate(order.orderDate)} />
                    <DetailField label="Due date" value={formatDate(order.dueDate)} />
                    <DetailField label="Amount">
                        {order.amount === null || order.amount === undefined ? null : (
                            <span className="tabular-nums">{formatMoney(order.amount)}</span>
                        )}
                    </DetailField>
                    <DetailField label="Primary owner" value={order.primaryOwner ? order.primaryOwner.name : null} />
                    <DetailField label="Description" className="md:col-span-2">
                        {order.description ? <span className="whitespace-pre-line">{order.description}</span> : null}
                    </DetailField>
                    <DetailField label="Notes" className="md:col-span-2">
                        {order.notes ? <span className="whitespace-pre-line">{order.notes}</span> : null}
                    </DetailField>
                </dl>
                <div className="border-t border-line pt-3 md:max-w-xs">
                    <StatusChanger order={order} onSaved={reload} />
                </div>
            </Card>
            <AssignmentsSection assignments={order.assignments || []} />
            {/* Sections added by later pipelines (one line each): P-05 invoices, P-06 received/outstanding. */}
            <OrderInvoicesSection orderId={order.id} />
        </>
    );
}

/** Order detail (F-05): all fields, assigned workers (primary and inactive marked), quick status change. */
export default function OrderDetailPage() {
    const { orderId } = useParams();
    const order = useOrder(orderId);
    return (
        <PageBody width="detail">
            <PageHeader backTo="/orders" backLabel="Orders" />
            <DataView resource={order} skeleton="detail">{(o) => <OrderDetail order={o} reload={order.reload} />}</DataView>
        </PageBody>
    );
}
