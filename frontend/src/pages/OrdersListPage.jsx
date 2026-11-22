import { useSearchParams } from 'react-router-dom';
import Badge from '../components/Badge.jsx';
import Button from '../components/Button.jsx';
import DataView from '../components/DataView.jsx';
import EmptyState from '../components/EmptyState.jsx';
import ListItem from '../components/ListItem.jsx';
import OfflineActionHint from '../components/OfflineActionHint.jsx';
import PageBody from '../components/PageBody.jsx';
import PageHeader from '../components/PageHeader.jsx';
import SegmentedControl from '../components/SegmentedControl.jsx';
import { ORDER_FILTERS, ORDER_STATUS_TONE, orderStatusLabel } from '../constants/orders.js';
import useListFilter from '../hooks/useListFilter.js';
import useOnlineStatus from '../hooks/useOnlineStatus.js';
import { useOrders } from '../hooks/useOrders.js';
import { formatDate } from '../utils/format.js';
import RecordNo from '../components/RecordNo.jsx';

const SEARCH_FIELDS = ['orderNumber', (o) => (o.client && o.client.name) || ''];

function subtitleOf(o) {
    const parts = [o.serviceName];
    if (o.receivedFrom && o.receivedFrom.name) parts.push(`From ${o.receivedFrom.name}`);
    if (o.primaryOwner && o.primaryOwner.name) parts.push(`Owner ${o.primaryOwner.name}`);
    return parts.filter(Boolean).join(' · ');
}

function OrderRows({ orders, filtered, query, setQuery, filter, addDisabled }) {

    if (orders.length === 0) {
        return (
            <EmptyState
                icon="orders"
                title="No orders yet"
                text="Record the work a client asks for, then assign workers to it."
                action={addDisabled ? undefined : { label: 'New order', to: '/orders/new', icon: 'plus' }}
            />
        );
    }

    return (
        <>
            {filtered.length === 0 ? (
                query.trim() ? (
                    <EmptyState
                        icon="search"
                        title={`No matches for “${query.trim()}”`}
                        action={{ label: 'Clear search', onClick: () => setQuery('') }}
                    />
                ) : (
                    <EmptyState icon="orders" title={`No ${orderStatusLabel(filter).toLowerCase()} orders.`} />
                )
            ) : (
                <div className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
                    {filtered.map((o) => (
                        <ListItem
                            key={o.id}
                            to={`/orders/${o.id}`}
                            title={
                                <>
                                    <span>{(o.client && o.client.name) || 'Unknown client'}</span>
                                    <RecordNo className="ml-2">{o.orderNumber}</RecordNo>
                                </>
                            }
                            subtitle={subtitleOf(o)}
                            meta={o.dueDate ? `Due ${formatDate(o.dueDate)}` : undefined}
                            badges={<Badge tone={ORDER_STATUS_TONE[o.status]}>{orderStatusLabel(o.status)}</Badge>}
                        />
                    ))}
                </div>
            )}
        </>
    );
}

/** Orders list (F-05): newest first, status filter (?status=) and search on the device. */
export default function OrdersListPage() {
    const { online } = useOnlineStatus();
    const orders = useOrders();
    const [params, setParams] = useSearchParams();
    const requested = params.get('status');
    const filter = ORDER_FILTERS.some((f) => f.value === requested) ? requested : 'ALL';

    const setFilter = (value) => {
        const next = new URLSearchParams(params);
        if (value === 'ALL') next.delete('status');
        else next.set('status', value);
        setParams(next, { replace: true });
    };

    // Search lives in the top bar, so it is filtered here and passed to the rows.
    const all = orders.data || [];
    const byStatus = filter === 'ALL' ? all : all.filter((o) => o.status === filter);
    const { query, setQuery, filtered } = useListFilter(byStatus, SEARCH_FIELDS);

    return (
        <PageBody width="list">
            <PageHeader
                title="Orders"
                search={all.length > 0 ? { value: query, onChange: setQuery, placeholder: 'Search order number or client' } : undefined}
                actions={
                    <Button icon="plus" to="/orders/new" disabled={!online} aria-label="New order">
                        <span className="md:hidden">New</span>
                        <span className="hidden md:inline">New order</span>
                    </Button>
                }
            />
            {!online && <OfflineActionHint className="mb-4" />}
            <SegmentedControl label="Status" options={ORDER_FILTERS} value={filter} onChange={setFilter} className="mb-3" />
            <DataView resource={orders} skeleton="rows">
                {(data) => (
                    <OrderRows orders={data || []} filtered={filtered} query={query} setQuery={setQuery} filter={filter} addDisabled={!online} />
                )}
            </DataView>
        </PageBody>
    );
}
