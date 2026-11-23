import { useCallback, useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Badge from '../components/Badge.jsx';
import Button from '../components/Button.jsx';
import ClientIcon from '../components/ClientIcon.jsx';
import DataView from '../components/DataView.jsx';
import DueLabel from '../components/DueLabel.jsx';
import EmptyState from '../components/EmptyState.jsx';
import InvoiceRow from '../components/InvoiceRow.jsx';
import ListToolbar from '../components/ListToolbar.jsx';
import Money from '../components/Money.jsx';
import OfflineActionHint from '../components/OfflineActionHint.jsx';
import PageBody from '../components/PageBody.jsx';
import PageHeader from '../components/PageHeader.jsx';
import RecordNo from '../components/RecordNo.jsx';
import ResponsiveList from '../components/ResponsiveList.jsx';
import {
    DEFAULT_INVOICE_SORT,
    INVOICE_FILTER_IMPLIED_STATUS,
    INVOICE_FILTERS,
    INVOICE_SORTS,
    INVOICE_STATUS_TONE,
    invoiceFilterCounts,
    invoiceStatusLabel,
    invoiceTotals,
} from '../constants/invoices.js';
import { useInvoices } from '../hooks/useInvoices.js';
import useListFilter from '../hooks/useListFilter.js';
import useListSort from '../hooks/useListSort.js';
import useMediaQuery from '../hooks/useMediaQuery.js';
import useOnlineStatus from '../hooks/useOnlineStatus.js';
import { useOrders } from '../hooks/useOrders.js';
import { isInvoiceOpen } from '../utils/due.js';
import { formatMoney } from '../utils/format.js';

const WIDE = '(min-width: 1024px)';
const SEARCH_FIELDS = ['invoiceNumber', (i) => (i.billedTo && i.billedTo.name) || '', (i) => (i.order && i.order.orderNumber) || ''];
const PHONE_SORTS = INVOICE_SORTS.filter((o) => !o.tableOnly);

const statusHidden = (invoice, filter) => (INVOICE_FILTER_IMPLIED_STATUS[filter] || []).includes(invoice.displayedStatus);
const rowKey = (i) => i.id;
const rowHref = (i) => `/invoices/${i.id}`;

/** Due cell: relative label for issued invoices, the plain date for drafts, nothing for cancelled. */
function DueCell({ invoice }) {
    if (invoice.baseStatus === 'CANCELLED') return <span className="text-ink-subtle">—</span>;
    if (invoice.baseStatus === 'DRAFT') return <DueLabel dueDate={invoice.dueDate} open={false} compact />;
    const open = isInvoiceOpen(invoice);
    return <DueLabel dueDate={invoice.dueDate} open={open} overdue={open ? Boolean(invoice.isOverdue) : undefined} compact />;
}

/** Outstanding cell: red when overdue, "Paid" when nothing is owed; drafts and cancelled owe nothing. */
function OutstandingCell({ invoice }) {
    if (invoice.baseStatus !== 'ISSUED') return <span className="text-ink-subtle">—</span>;
    return <Money value={invoice.outstanding ?? 0} overdue={Boolean(invoice.isOverdue)} strong paidLabel />;
}

function OrderCell({ order, service }) {
    if (!order || !order.id) return <span className="text-ink-subtle">—</span>;
    return (
        <Link
            to={`/orders/${order.id}`}
            className="relative z-10 inline-flex flex-col rounded-control hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
            <RecordNo>{order.orderNumber || 'Order'}</RecordNo>
            {service && <span className="text-[13px]/[18px] break-words text-ink-muted">{service}</span>}
        </Link>
    );
}

/**
 * Fits a 734 px table (1024 px, sidebar expanded): Order hides under 50rem, and the number, due,
 * money and status columns take their one-line content width (no fixed widths).
 */
function invoiceColumns({ filter, serviceByOrderId }) {
    return [
        { key: 'number', header: 'Number', nowrap: true, render: (i) => <span className="whitespace-nowrap tabular-nums">{i.invoiceNumber}</span> },
        {
            key: 'billedTo',
            header: 'Billed to',
            // Priority width: 17% of the table, at most 12rem (from a ~1130 px table, 1440 px). The
            // other visible columns are one-line, so any spare width also goes here.
            minWidth: 'min(12rem, 17cqi)',
            render: (i) => (
                <span className="flex items-center gap-2">
                    {i.billedTo && <ClientIcon type={i.billedTo.type} size="inline" />}
                    <span className="break-words">{(i.billedTo && i.billedTo.name) || 'Unknown'}</span>
                </span>
            ),
        },
        { key: 'order', header: 'Order', hideNarrow: true, render: (i) => <OrderCell order={i.order} service={i.order ? serviceByOrderId.get(i.order.id) : null} /> },
        { key: 'due', header: 'Due', sortKey: 'due', nowrap: true, render: (i) => <DueCell invoice={i} /> },
        {
            key: 'total',
            header: 'Total',
            align: 'right',
            sortKey: 'total',
            sortDesc: true,
            nowrap: true,
            render: (i) =>
                i.baseStatus === 'CANCELLED' ? (
                    <span className="whitespace-nowrap text-ink-subtle tabular-nums">{formatMoney(i.total, { paise: 'none' })}</span>
                ) : (
                    <Money value={i.total} />
                ),
        },
        {
            key: 'outstanding',
            header: 'Outstanding',
            align: 'right',
            sortKey: 'outstanding',
            sortDesc: true,
            nowrap: true,
            render: (i) => <OutstandingCell invoice={i} />,
        },
        {
            key: 'status',
            header: 'Status',
            nowrap: true,
            render: (i) =>
                statusHidden(i, filter) ? null : <Badge tone={INVOICE_STATUS_TONE[i.displayedStatus]}>{invoiceStatusLabel(i.displayedStatus)}</Badge>,
        },
    ];
}

/**
 * Desktop table (lg+). The invoice list only carries the order number, so the orders list is
 * loaded here (desktop only) to show each related order's service; until it loads, the number alone.
 */
function InvoiceTable({ rows, filter, sort }) {
    const orders = useOrders();
    const serviceByOrderId = useMemo(() => {
        const map = new Map();
        for (const o of orders.data || []) if (o && o.id && o.serviceName) map.set(o.id, o.serviceName);
        return map;
    }, [orders.data]);
    const columns = useMemo(() => invoiceColumns({ filter, serviceByOrderId }), [filter, serviceByOrderId]);

    return (
        <ResponsiveList
            rows={rows}
            rowKey={rowKey}
            table={{ columns, rowHref, sort: sort.sort, onSortChange: sort.setSort, caption: 'Invoices' }}
            renderRow={(i) => <InvoiceRow invoice={i} hideStatus={statusHidden(i, filter)} />}
        />
    );
}

function InvoiceResults({ invoices, rows, query, setQuery, filter, sort, wide, addDisabled }) {
    if (invoices.length === 0) {
        return (
            <EmptyState
                icon="invoices"
                title="No invoices yet"
                text="Raise an invoice for a person or company, or from an order."
                action={addDisabled ? undefined : { label: 'New invoice', to: '/invoices/new', icon: 'plus' }}
            />
        );
    }

    if (rows.length === 0) {
        if (query.trim()) {
            return <EmptyState icon="search" title={`No matches for “${query.trim()}”`} action={{ label: 'Clear search', onClick: () => setQuery('') }} />;
        }
        const active = INVOICE_FILTERS.find((f) => f.value === filter) || INVOICE_FILTERS[0];
        return <EmptyState icon="invoices" title={`No ${active.label.toLowerCase()} invoices.`} />;
    }

    if (wide) return <InvoiceTable rows={rows} filter={filter} sort={sort} />;
    return <ResponsiveList rows={rows} rowKey={rowKey} renderRow={(i) => <InvoiceRow invoice={i} hideStatus={statusHidden(i, filter)} />} />;
}

/** Summary strip for the invoices in view: "Outstanding ₹8,108 · Overdue ₹7,700 (1)". */
function summaryItems(rows, filter) {
    const totals = invoiceTotals(rows);
    // Draft, Paid and Cancelled owe nothing; a line of zeros there is noise.
    if (totals.openCount === 0 && !['all', 'unpaid', 'overdue'].includes(filter)) return undefined;
    return [
        { label: 'Outstanding', value: formatMoney(totals.outstanding, { paise: 'none' }) },
        {
            label: 'Overdue',
            value: `${formatMoney(totals.overdue, { paise: 'none' })} (${totals.overdueCount})`,
            tone: totals.overdueCount > 0 ? 'danger' : undefined,
        },
    ];
}

/**
 * Invoices list (F-24): who owes what. Filter chips with counts (?filter=, values kept for Home),
 * a summary of what is owed for the invoices in view, sort (?sort=), search on the device.
 * Phones and tablets: two-line InvoiceRow; lg+: sortable table.
 */
export default function InvoicesListPage() {
    const { online } = useOnlineStatus();
    const wide = useMediaQuery(WIDE);
    const invoices = useInvoices();
    const [params, setParams] = useSearchParams();
    const requested = params.get('filter');
    const filter = INVOICE_FILTERS.some((f) => f.value === requested) ? requested : 'all';
    const sort = useListSort(INVOICE_SORTS, DEFAULT_INVOICE_SORT);

    const setFilter = useCallback(
        (value) => {
            setParams(
                (prev) => {
                    const next = new URLSearchParams(prev);
                    if (value === 'all') next.delete('filter');
                    else next.set('filter', value);
                    return next;
                },
                { replace: true }
            );
        },
        [setParams]
    );

    const all = useMemo(() => invoices.data || [], [invoices.data]);
    const counts = useMemo(() => invoiceFilterCounts(all), [all]);
    const activeFilter = INVOICE_FILTERS.find((f) => f.value === filter) || INVOICE_FILTERS[0];
    const inFilter = useMemo(() => all.filter(activeFilter.test), [all, activeFilter]);

    // Search lives in the top bar, so it is applied here and the result is passed down.
    const { query, setQuery, filtered } = useListFilter(inFilter, SEARCH_FIELDS);
    const rows = useMemo(() => filtered.slice().sort(sort.compare), [filtered, sort.compare]);

    const filterOptions = INVOICE_FILTERS.map(({ value, label }) => ({
        value,
        label,
        count: invoices.data ? counts[value] : undefined,
        tone: value === 'overdue' ? 'danger' : undefined,
    }));
    const phoneSort = useMemo(() => ({ ...sort, options: PHONE_SORTS }), [sort]);

    return (
        <PageBody width="list">
            <PageHeader
                title="Invoices"
                search={all.length > 0 ? { value: query, onChange: setQuery, placeholder: 'Search invoice, billed to or order' } : undefined}
                actions={
                    <Button icon="plus" to="/invoices/new" disabled={!online} aria-label="New invoice">
                        <span className="md:hidden">New</span>
                        <span className="hidden md:inline">New invoice</span>
                    </Button>
                }
            />
            {!online && <OfflineActionHint className="mb-4" />}
            <ListToolbar
                filter={{ label: 'Filter invoices', options: filterOptions, value: filter, onChange: setFilter }}
                sort={all.length > 1 ? phoneSort : undefined}
                summary={all.length > 0 ? summaryItems(filtered, filter) : undefined}
            />
            <DataView resource={invoices} skeleton={wide ? 'table' : 'rows'}>
                {(data) => (
                    <InvoiceResults
                        invoices={data || []}
                        rows={rows}
                        query={query}
                        setQuery={setQuery}
                        filter={filter}
                        sort={sort}
                        wide={wide}
                        addDisabled={!online}
                    />
                )}
            </DataView>
        </PageBody>
    );
}
