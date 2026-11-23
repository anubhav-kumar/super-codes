import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import Badge from '../components/Badge.jsx';
import Button from '../components/Button.jsx';
import ClientIcon from '../components/ClientIcon.jsx';
import DataView from '../components/DataView.jsx';
import DueLabel from '../components/DueLabel.jsx';
import EmptyState from '../components/EmptyState.jsx';
import ListToolbar from '../components/ListToolbar.jsx';
import Money from '../components/Money.jsx';
import OfflineActionHint from '../components/OfflineActionHint.jsx';
import OrderRow from '../components/OrderRow.jsx';
import PageBody from '../components/PageBody.jsx';
import PageHeader from '../components/PageHeader.jsx';
import RecordNo from '../components/RecordNo.jsx';
import ResponsiveList from '../components/ResponsiveList.jsx';
import { ORDER_LIST_FILTERS, ORDER_SORTS, ORDER_STATUS_TONE, orderListFilterFromParams, orderStatusLabel } from '../constants/orders.js';
import useListFilter from '../hooks/useListFilter.js';
import useListSort from '../hooks/useListSort.js';
import useMediaQuery from '../hooks/useMediaQuery.js';
import useOnlineStatus from '../hooks/useOnlineStatus.js';
import { useOrders } from '../hooks/useOrders.js';
import { todayLocal } from '../utils/dates.js';
import { isOrderOpen } from '../utils/due.js';

const SEARCH_FIELDS = [
    'orderNumber',
    (o) => (o.client && o.client.name) || '',
    'serviceName',
    (o) => (o.primaryOwner && o.primaryOwner.name) || '',
];

// Phones sort through a menu (due, order date, amount); number and client sort from table headers.
const MENU_SORTS = ORDER_SORTS.filter((o) => o.menu);

/**
 * Desktop table columns (lg+). The Status column is dropped when a status chip already says it.
 * Fits a 734 px table (1024 px, sidebar expanded): Owner hides under 50rem, Number takes its content
 * width, and Client keeps 9.5rem (11rem from a ~1070 px table) so short client names stay on one line.
 */
function tableColumns(hideStatus) {
    const columns = [
        { key: 'number', header: 'Number', sortKey: 'number', nowrap: true, render: (o) => <RecordNo className="text-sm">{o.orderNumber}</RecordNo> },
        {
            key: 'client',
            header: 'Client',
            sortKey: 'client',
            minWidth: 'clamp(9.5rem, 16.5cqi, 11rem)',
            render: (o) => (
                <span className="flex items-start gap-2 font-medium break-words">
                    {o.client && <ClientIcon type={o.client.type} size="inline" className="mt-0.5" />}
                    <span className="min-w-0">{(o.client && o.client.name) || 'Unknown client'}</span>
                </span>
            ),
        },
        { key: 'service', header: 'Service', render: (o) => <span className="break-words">{o.serviceName}</span> },
        {
            key: 'owner',
            header: 'Owner',
            // One line once the table has room (56rem: 1024 px with the rail); hidden under 50rem.
            nowrap: 'wide',
            hideNarrow: true,
            render: (o) =>
                o.primaryOwner && o.primaryOwner.name ? (
                    <span className="text-ink-muted">{o.primaryOwner.name}</span>
                ) : (
                    <span className="text-ink-subtle">—</span>
                ),
        },
        { key: 'due', header: 'Due', sortKey: 'due', nowrap: true, render: (o) => <DueLabel dueDate={o.dueDate} open={isOrderOpen(o)} compact /> },
        { key: 'amount', header: 'Amount', align: 'right', nowrap: true, sortKey: 'amount', sortDesc: true, render: (o) => <Money value={o.amount} /> },
    ];
    if (!hideStatus) {
        columns.push({
            key: 'status',
            header: 'Status',
            nowrap: true,
            render: (o) => <Badge tone={ORDER_STATUS_TONE[o.status]}>{orderStatusLabel(o.status)}</Badge>,
        });
    }
    return columns;
}

function FilterEmpty({ filter }) {
    if (filter.value === 'overdue') return <EmptyState icon="success" title="No overdue orders." />;
    if (filter.value === 'due-week') return <EmptyState icon="due" title="Nothing due this week." />;
    return <EmptyState icon="orders" title={`No ${filter.label.toLowerCase()} orders.`} />;
}

function OrderRows({ orders, rows, query, setQuery, filter, list, addDisabled }) {
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

    if (rows.length === 0) {
        if (query.trim()) {
            return <EmptyState icon="search" title={`No matches for “${query.trim()}”`} action={{ label: 'Clear search', onClick: () => setQuery('') }} />;
        }
        return <FilterEmpty filter={filter} />;
    }

    const hideStatus = Boolean(filter.status);
    return (
        <ResponsiveList
            rows={rows}
            rowKey={(o) => o.id}
            table={{
                columns: tableColumns(hideStatus),
                rowHref: (o) => `/orders/${o.id}`,
                sort: list.sort,
                onSortChange: list.setSort,
                caption: 'Orders',
            }}
            renderRow={(o) => <OrderRow order={o} hideStatus={hideStatus} />}
        />
    );
}

/**
 * Orders list by urgency (F-22). Chips with counts: All, Overdue, Due this week, then statuses
 * (?filter=overdue | due-week, ?status=CODE). Sort in ?sort= (default due: overdue first, then
 * soonest, no due date last). Two-line OrderRows on phones (the order number sits on line 2, so a
 * long client name never pushes it out of view), a table from 1024 px. Counts, filters, sorting
 * and due labels run on the device, so they also work on cached data offline.
 */
export default function OrdersListPage() {
    const { online } = useOnlineStatus();
    const orders = useOrders();
    const wide = useMediaQuery('(min-width: 1024px)');
    const [params, setParams] = useSearchParams();
    const filter = orderListFilterFromParams(params);
    const list = useListSort(ORDER_SORTS, 'due');

    const setFilter = (value) => {
        const chosen = ORDER_LIST_FILTERS.find((f) => f.value === value) || ORDER_LIST_FILTERS[0];
        setParams(
            (prev) => {
                const next = new URLSearchParams(prev);
                next.delete('filter');
                next.delete('status');
                if (chosen.param) next.set(chosen.param[0], chosen.param[1]);
                return next;
            },
            { replace: true }
        );
    };

    const all = useMemo(() => orders.data || [], [orders.data]);
    const today = todayLocal();

    // Counts cover every loaded order (search does not change them), so they match Home.
    const filterOptions = useMemo(
        () =>
            ORDER_LIST_FILTERS.map((f) => ({
                value: f.value,
                label: f.label,
                tone: f.tone,
                count: all.filter((o) => f.test(o, today)).length,
            })),
        [all, today]
    );

    const inFilter = useMemo(() => all.filter((o) => filter.test(o, today)), [all, filter, today]);
    // Search lives in the top bar, so it is applied here and the rows get the result.
    const { query, setQuery, filtered } = useListFilter(inFilter, SEARCH_FIELDS);
    const rows = useMemo(() => filtered.slice().sort(list.compare), [filtered, list.compare]);

    return (
        <PageBody width="list">
            <PageHeader
                title="Orders"
                search={all.length > 0 ? { value: query, onChange: setQuery, placeholder: 'Search orders, clients, services' } : undefined}
                actions={
                    <Button icon="plus" to="/orders/new" disabled={!online} aria-label="New order">
                        <span className="md:hidden">New</span>
                        <span className="hidden md:inline">New order</span>
                    </Button>
                }
            />
            {!online && <OfflineActionHint className="mb-4" />}
            <ListToolbar
                filter={{ label: 'Filter orders', options: filterOptions, value: filter.value, onChange: setFilter }}
                sort={{ ...list, options: MENU_SORTS }}
            />
            <DataView resource={orders} skeleton={wide ? 'table' : 'rows'}>
                {(data) => (
                    <OrderRows orders={data || []} rows={rows} query={query} setQuery={setQuery} filter={filter} list={list} addDisabled={!online} />
                )}
            </DataView>
        </PageBody>
    );
}
