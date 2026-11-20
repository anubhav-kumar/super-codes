import { useSearchParams } from 'react-router-dom';
import Button from '../components/Button.jsx';
import DataView from '../components/DataView.jsx';
import EmptyState from '../components/EmptyState.jsx';
import InvoiceStatusBadges from '../components/InvoiceStatusBadges.jsx';
import ListItem from '../components/ListItem.jsx';
import OfflineActionHint from '../components/OfflineActionHint.jsx';
import PageHeader from '../components/PageHeader.jsx';
import SearchInput from '../components/SearchInput.jsx';
import SegmentedControl from '../components/SegmentedControl.jsx';
import { INVOICE_FILTERS } from '../constants/invoices.js';
import { useInvoices } from '../hooks/useInvoices.js';
import useListFilter from '../hooks/useListFilter.js';
import useOnlineStatus from '../hooks/useOnlineStatus.js';
import { formatDate, formatMoney } from '../utils/format.js';

const SEARCH_FIELDS = ['invoiceNumber', (i) => (i.billedTo && i.billedTo.name) || ''];
const FILTER_OPTIONS = INVOICE_FILTERS.map(({ value, label }) => ({ value, label }));

function subtitleOf(i) {
    const parts = [];
    if (i.order && i.order.orderNumber) parts.push(`Order ${i.order.orderNumber}`);
    if (i.dueDate) parts.push(`Due ${formatDate(i.dueDate)}`);
    return parts.join(' · ');
}

function InvoiceRows({ invoices, filter, addDisabled }) {
    const active = INVOICE_FILTERS.find((f) => f.value === filter) || INVOICE_FILTERS[0];
    const byFilter = invoices.filter(active.test);
    const { query, setQuery, filtered } = useListFilter(byFilter, SEARCH_FIELDS);

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

    return (
        <>
            <SearchInput value={query} onChange={setQuery} placeholder="Search invoice number or billed to" className="mb-4" />
            {filtered.length === 0 ? (
                query.trim() ? (
                    <EmptyState
                        icon="search"
                        title={`No matches for “${query.trim()}”`}
                        action={{ label: 'Clear search', onClick: () => setQuery('') }}
                    />
                ) : (
                    <EmptyState icon="invoices" title={`No ${active.label.toLowerCase()} invoices.`} />
                )
            ) : (
                <div className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
                    {filtered.map((i) => (
                        <ListItem
                            key={i.id}
                            to={`/invoices/${i.id}`}
                            title={
                                <>
                                    <span className="font-mono text-sm">{i.invoiceNumber}</span>
                                    <span className="ml-2">{(i.billedTo && i.billedTo.name) || 'Unknown'}</span>
                                </>
                            }
                            subtitle={subtitleOf(i)}
                            meta={formatMoney(i.total)}
                            badges={<InvoiceStatusBadges invoice={i} />}
                        />
                    ))}
                </div>
            )}
        </>
    );
}

/** Invoices list (F-06): newest first, filter (?filter=) and search on the device. */
export default function InvoicesListPage() {
    const { online } = useOnlineStatus();
    const invoices = useInvoices();
    const [params, setParams] = useSearchParams();
    const requested = params.get('filter');
    const filter = INVOICE_FILTERS.some((f) => f.value === requested) ? requested : 'all';

    const setFilter = (value) => {
        const next = new URLSearchParams(params);
        if (value === 'all') next.delete('filter');
        else next.set('filter', value);
        setParams(next, { replace: true });
    };

    return (
        <>
            <PageHeader
                title="Invoices"
                actions={
                    <Button icon="plus" to="/invoices/new" disabled={!online}>
                        New invoice
                    </Button>
                }
            />
            {!online && <OfflineActionHint className="-mt-2 mb-4" />}
            <SegmentedControl label="Filter" options={FILTER_OPTIONS} value={filter} onChange={setFilter} className="mb-3" />
            <DataView resource={invoices}>
                {(data) => <InvoiceRows invoices={data || []} filter={filter} addDisabled={!online} />}
            </DataView>
        </>
    );
}
