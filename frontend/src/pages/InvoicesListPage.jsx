import { useSearchParams } from 'react-router-dom';
import Button from '../components/Button.jsx';
import DataView from '../components/DataView.jsx';
import EmptyState from '../components/EmptyState.jsx';
import InvoiceStatusBadges from '../components/InvoiceStatusBadges.jsx';
import ListItem from '../components/ListItem.jsx';
import OfflineActionHint from '../components/OfflineActionHint.jsx';
import PageBody from '../components/PageBody.jsx';
import PageHeader from '../components/PageHeader.jsx';
import SegmentedControl from '../components/SegmentedControl.jsx';
import { INVOICE_FILTERS } from '../constants/invoices.js';
import { useInvoices } from '../hooks/useInvoices.js';
import useListFilter from '../hooks/useListFilter.js';
import useOnlineStatus from '../hooks/useOnlineStatus.js';
import { formatDate, formatMoney } from '../utils/format.js';
import RecordNo from '../components/RecordNo.jsx';

const SEARCH_FIELDS = ['invoiceNumber', (i) => (i.billedTo && i.billedTo.name) || ''];
const FILTER_OPTIONS = INVOICE_FILTERS.map(({ value, label }) => ({ value, label }));

function subtitleOf(i) {
    const parts = [];
    if (i.order && i.order.orderNumber) parts.push(`Order ${i.order.orderNumber}`);
    if (i.dueDate) parts.push(`Due ${formatDate(i.dueDate)}`);
    return parts.join(' · ');
}

// Total, plus the server's outstanding when something is still owed (F-07).
function metaOf(i) {
    const owed = Number(i.outstanding) > 0;
    if (owed && Number(i.outstanding) !== Number(i.total)) return `${formatMoney(i.total)} · ${formatMoney(i.outstanding)} due`;
    if (owed) return `${formatMoney(i.total)} due`;
    return formatMoney(i.total);
}

function InvoiceRows({ invoices, filtered, query, setQuery, filter, addDisabled }) {
    const active = INVOICE_FILTERS.find((f) => f.value === filter) || INVOICE_FILTERS[0];

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
                                    <span>{(i.billedTo && i.billedTo.name) || 'Unknown'}</span>
                                    <RecordNo className="ml-2">{i.invoiceNumber}</RecordNo>
                                </>
                            }
                            subtitle={subtitleOf(i)}
                            meta={metaOf(i)}
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

    // Search lives in the top bar, so it is filtered here and passed to the rows.
    const all = invoices.data || [];
    const activeFilter = INVOICE_FILTERS.find((f) => f.value === filter) || INVOICE_FILTERS[0];
    const { query, setQuery, filtered } = useListFilter(all.filter(activeFilter.test), SEARCH_FIELDS);

    return (
        <PageBody width="list">
            <PageHeader
                title="Invoices"
                search={all.length > 0 ? { value: query, onChange: setQuery, placeholder: 'Search invoice number or billed to' } : undefined}
                actions={
                    <Button icon="plus" to="/invoices/new" disabled={!online} aria-label="New invoice">
                        <span className="md:hidden">New</span>
                        <span className="hidden md:inline">New invoice</span>
                    </Button>
                }
            />
            {!online && <OfflineActionHint className="mb-4" />}
            <SegmentedControl label="Filter" options={FILTER_OPTIONS} value={filter} onChange={setFilter} className="mb-3" />
            <DataView resource={invoices}>
                {(data) => (
                    <InvoiceRows invoices={data || []} filtered={filtered} query={query} setQuery={setQuery} filter={filter} addDisabled={!online} />
                )}
            </DataView>
        </PageBody>
    );
}
