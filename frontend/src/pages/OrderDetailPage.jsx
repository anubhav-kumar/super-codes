import { Link, useParams } from 'react-router-dom';
import Badge from '../components/Badge.jsx';
import Button from '../components/Button.jsx';
import ClientIcon from '../components/ClientIcon.jsx';
import DataView from '../components/DataView.jsx';
import DueLabel from '../components/DueLabel.jsx';
import FactList from '../components/FactList.jsx';
import ListRow from '../components/ListRow.jsx';
import Money from '../components/Money.jsx';
import OfflineActionHint from '../components/OfflineActionHint.jsx';
import OrderBillingSection from '../components/orders/OrderBillingSection.jsx';
import StatusControl from '../components/orders/StatusControl.jsx';
import PageBody from '../components/PageBody.jsx';
import PageHeader from '../components/PageHeader.jsx';
import RecordHeader from '../components/RecordHeader.jsx';
import RecordNo from '../components/RecordNo.jsx';
import Section from '../components/Section.jsx';
import Tag from '../components/Tag.jsx';
import { orderUpdateBody, updateOrder } from '../api/orders.js';
import { clientPath, orderStatusLabel } from '../constants/orders.js';
import useInlineSave from '../hooks/useInlineSave.js';
import useOnlineStatus from '../hooks/useOnlineStatus.js';
import { useOrder } from '../hooks/useOrders.js';
import useRecordVisit from '../hooks/useRecordVisit.js';
import { isOrderOpen } from '../utils/due.js';
import { formatDate } from '../utils/format.js';

const linkClass = 'text-ink underline-offset-2 hover:underline focus-visible:underline';

const present = (v) => v !== null && v !== undefined && v !== '';

function ClientLine({ client }) {
    if (!client) return null;
    const name = client.name || 'Unknown client';
    const to = clientPath(client);
    return (
        <span className="inline-flex items-center gap-1.5">
            <ClientIcon type={client.type} size="inline" />
            {to ? (
                <Link to={to} className={linkClass}>
                    {name}
                </Link>
            ) : (
                name
            )}
        </span>
    );
}

function WorkersSection({ assignments }) {
    return (
        <Section title="Workers" count={assignments.length || ''}>
            {assignments.length === 0 ? (
                <p className="px-4 pb-4 text-sm text-ink-muted">No workers assigned.</p>
            ) : (
                <ul className="divide-y divide-line border-t border-line">
                    {assignments.map((a) => (
                        <li key={a.workerId}>
                            <ListRow
                                to={`/workers/${a.workerId}`}
                                title={a.workerName || 'Unknown worker'}
                                trailing={a.workerStatus === 'INACTIVE' ? <Badge>Inactive</Badge> : undefined}
                                meta={[
                                    a.isPrimary ? <Tag key="primary">Primary owner</Tag> : null,
                                    a.assignedDate ? `Assigned ${formatDate(a.assignedDate)}` : null,
                                ]}
                            />
                        </li>
                    ))}
                </ul>
            )}
        </Section>
    );
}

function TextSection({ title, text }) {
    return (
        <Section title={title} flush={false}>
            <p className="text-[15px]/[22px] break-words whitespace-pre-line text-ink md:text-sm/6">{text}</p>
        </Section>
    );
}

function OrderDetail({ order, reload }) {
    const { online } = useOnlineStatus();
    // Owned here (not inside the control) so the header badge and the due label follow the new
    // status the moment it is chosen, and roll back with it if the save fails.
    const status = useInlineSave(order.status);
    const shown = { ...order, status: status.value };
    const editTo = `/orders/${order.id}/edit`;

    const changeStatus = async (next) => {
        if (!next || next === status.value) return;
        // PUT needs the full field set; everything except status is sent back as loaded.
        const result = await status.save(next, () => updateOrder(order.id, orderUpdateBody(order, { status: next })), {
            success: `Status changed to ${orderStatusLabel(next)}`,
        });
        if (result.ok) reload();
    };

    const owner = order.primaryOwner;
    const facts = [
        order.receivedFrom && order.receivedFrom.id
            ? { label: 'Received from', value: order.receivedFrom.name || 'Unknown person', to: `/people/${order.receivedFrom.id}` }
            : null,
        owner ? { label: 'Primary owner', value: owner.name || 'Unknown worker', to: owner.id ? `/workers/${owner.id}` : undefined } : null,
        { label: 'Order date', value: formatDate(order.orderDate) },
        { label: 'Due date', value: formatDate(order.dueDate) },
        { label: 'Amount', value: present(order.amount) ? <Money value={order.amount} /> : null },
    ];
    const addLinks = online
        ? [
              !present(order.dueDate) ? { label: 'Add due date', to: editTo } : null,
              !present(order.amount) ? { label: 'Add amount', to: editTo } : null,
              !present(order.notes) ? { label: 'Add notes', to: editTo } : null,
          ]
        : [];

    return (
        <>
            <RecordHeader
                eyebrow={<RecordNo>{order.orderNumber}</RecordNo>}
                title={order.serviceName || order.orderNumber}
                subtitle={<ClientLine client={order.client} />}
                meta={[
                    <StatusControl key="status" value={status.value} saving={status.saving} disabled={!online} onChange={changeStatus} />,
                    <DueLabel key="due" dueDate={order.dueDate} open={isOrderOpen(shown)} />,
                ]}
                actions={
                    <>
                        <Button icon="raise-invoice" to={`/invoices/new?orderId=${encodeURIComponent(order.id)}`} disabled={!online}>
                            Raise invoice
                        </Button>
                        <Button variant="secondary" icon="edit" to={editTo} disabled={!online}>
                            Edit
                        </Button>
                    </>
                }
            >
                {!online && <OfflineActionHint />}
            </RecordHeader>
            {/*
              Phones: one column in the order Details, Billing, Workers, Description, Notes (the left
              column's wrapper is `contents`, so `order-*` interleaves Billing). lg+: two columns,
              left Details / Workers / Description / Notes, right Billing.
            */}
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] lg:items-start lg:gap-6">
                <div className="contents lg:flex lg:flex-col lg:gap-4">
                    <Section title="Details" flush={false} className="order-1 lg:order-none">
                        <FactList items={facts} addLinks={addLinks} />
                    </Section>
                    <div className="order-3 lg:order-none">
                        <WorkersSection assignments={order.assignments || []} />
                    </div>
                    {present(order.description) && (
                        <div className="order-4 lg:order-none">
                            <TextSection title="Description" text={order.description} />
                        </div>
                    )}
                    {present(order.notes) && (
                        <div className="order-5 lg:order-none">
                            <TextSection title="Notes" text={order.notes} />
                        </div>
                    )}
                </div>
                <OrderBillingSection order={order} className="order-2 lg:order-none" />
            </div>
        </>
    );
}

/** Order detail (F-05, rebuilt in F-23): header with status control and actions, facts, billing, workers, text. */
export default function OrderDetailPage() {
    const { orderId } = useParams();
    const order = useOrder(orderId);
    useRecordVisit('order', orderId, order);
    return (
        <PageBody width="detail">
            <PageHeader backTo="/orders" backLabel="Orders" />
            <DataView resource={order} skeleton="detail" notFoundTitle="Order not found">
                {(o) => <OrderDetail order={o} reload={order.reload} />}
            </DataView>
        </PageBody>
    );
}
