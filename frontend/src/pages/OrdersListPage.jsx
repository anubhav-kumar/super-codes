import { useSearchParams } from 'react-router-dom';
import Badge from '../components/Badge.jsx';
import Button from '../components/Button.jsx';
import DataView from '../components/DataView.jsx';
import EmptyState from '../components/EmptyState.jsx';
import ListItem from '../components/ListItem.jsx';
import OfflineActionHint from '../components/OfflineActionHint.jsx';
import PageHeader from '../components/PageHeader.jsx';
import SearchInput from '../components/SearchInput.jsx';
import SegmentedControl from '../components/SegmentedControl.jsx';
import { ORDER_FILTERS, ORDER_STATUS_TONE, orderStatusLabel } from '../constants/orders.js';
import useListFilter from '../hooks/useListFilter.js';
import useOnlineStatus from '../hooks/useOnlineStatus.js';
import { useOrders } from '../hooks/useOrders.js';
import { formatDate } from '../utils/format.js';

const SEARCH_FIELDS = ['orderNumber', (o) => (o.client && o.client.name) || ''];

function subtitleOf(o) {
    const parts = [o.serviceName];
    if (o.receivedFrom && o.receivedFrom.name) parts.push(`From ${o.receivedFrom.name}`);
    if (o.primaryOwner && o.primaryOwner.name) parts.push(`Owner ${o.primaryOwner.name}`);
    return parts.filter(Boolean).join(' · ');
}

function OrderRows({ orders, filter, addDisabled }) {
    const byStatus = filter === 'ALL' ? orders : orders.filter((o) => o.status === filter);
    const { query, setQuery, filtered } = useListFilter(byStatus, SEARCH_FIELDS);

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
            <SearchInput value={query} onChange={setQuery} placeholder="Search order number or client" className="mb-4" />
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
                                    <span className="font-mono text-sm">{o.orderNumber}</span>
                                    <span className="ml-2">{(o.client && o.client.name) || 'Unknown client'}</span>
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

    return (
        <>
            <PageHeader
                title="Orders"
                actions={
                    <Button icon="plus" to="/orders/new" disabled={!online}>
                        New order
                    </Button>
                }
            />
            {!online && <OfflineActionHint className="-mt-2 mb-4" />}
            <SegmentedControl label="Status" options={ORDER_FILTERS} value={filter} onChange={setFilter} className="mb-3" />
            <DataView resource={orders}>
                {(data) => <OrderRows orders={data || []} filter={filter} addDisabled={!online} />}
            </DataView>
        </>
    );
}
