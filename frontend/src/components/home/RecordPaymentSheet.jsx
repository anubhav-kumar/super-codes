import { useMemo, useState } from 'react';
import { useInvoices } from '../../hooks/useInvoices.js';
import { isInvoiceOpen } from '../../utils/due.js';
import { matchesSearch } from '../../utils/search.js';
import DataView from '../DataView.jsx';
import EmptyState from '../EmptyState.jsx';
import InvoiceRow from '../InvoiceRow.jsx';
import SearchInput from '../SearchInput.jsx';
import Sheet from '../Sheet.jsx';

const SEARCH_FIELDS = ['invoiceNumber', (i) => (i.billedTo && i.billedTo.name) || ''];

// Overdue first, then earliest due date; no due date last.
function byUrgency(a, b) {
    if (Boolean(a.isOverdue) !== Boolean(b.isOverdue)) return a.isOverdue ? -1 : 1;
    const da = a.dueDate || '';
    const db = b.dueDate || '';
    if (da === db) return 0;
    if (!da) return 1;
    if (!db) return -1;
    return da < db ? -1 : 1;
}

function OpenInvoices({ invoices, query, setQuery }) {
    const open = useMemo(() => (invoices || []).filter(isInvoiceOpen).sort(byUrgency), [invoices]);
    const shown = useMemo(() => open.filter((i) => matchesSearch(i, query, SEARCH_FIELDS)), [open, query]);

    if (open.length === 0) {
        return <EmptyState icon="success" compact title="No unpaid invoices" text="Issued invoices with money still owed show here." />;
    }
    if (shown.length === 0) {
        return (
            <EmptyState
                icon="search"
                compact
                title={`No matches for “${query.trim()}”`}
                action={{ label: 'Clear search', onClick: () => setQuery('') }}
            />
        );
    }
    return (
        <ul className="-mx-4 divide-y divide-line border-t border-line md:-mx-5">
            {shown.map((invoice) => (
                <li key={invoice.id}>
                    <InvoiceRow invoice={invoice} hideStatus to={`/invoices/${encodeURIComponent(invoice.id)}/payments/new`} />
                </li>
            ))}
        </ul>
    );
}

function SheetBody() {
    const invoices = useInvoices();
    const [query, setQuery] = useState('');
    return (
        <div className="flex flex-col gap-3">
            <SearchInput value={query} onChange={setQuery} placeholder="Search invoice number or client" />
            <DataView resource={invoices} compact loaderRows={3}>
                {(data) => <OpenInvoices invoices={data} query={query} setQuery={setQuery} />}
            </DataView>
        </div>
    );
}

/**
 * Record payment from Home (F-21): pick an Issued invoice with money still owed (isInvoiceOpen),
 * then the received-payment form opens for it (/invoices/:id/payments/new).
 * Invoices load only while the sheet is open.
 */
export default function RecordPaymentSheet({ open, onClose }) {
    return (
        <Sheet open={open} title="Record payment" onClose={onClose}>
            {open && <SheetBody />}
        </Sheet>
    );
}
