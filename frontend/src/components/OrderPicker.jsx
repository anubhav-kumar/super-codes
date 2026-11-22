import { useEffect, useId, useMemo, useState } from 'react';
import { ORDER_STATUS_TONE, orderStatusLabel } from '../constants/orders.js';
import { useOrders } from '../hooks/useOrders.js';
import { matchesSearch } from '../utils/search.js';
import Badge from './Badge.jsx';
import DataView from './DataView.jsx';
import EmptyState from './EmptyState.jsx';
import { controlClass, FieldLabel, FieldMessage } from './fieldStyles.jsx';
import Icon from './Icon.jsx';
import SearchInput from './SearchInput.jsx';
import RecordNo from './RecordNo.jsx';

/** Value shape: { id, orderNumber, clientName } or null. */

const SEARCH_FIELDS = ['orderNumber', 'serviceName', (o) => (o.client && o.client.name) || ''];

function OrderRows({ orders, query, setQuery, onPick }) {
    const filtered = useMemo(() => (orders || []).filter((o) => matchesSearch(o, query, SEARCH_FIELDS)), [orders, query]);
    if (filtered.length === 0) {
        return query.trim() ? (
            <EmptyState
                icon="search"
                compact
                title={`No matches for “${query.trim()}”`}
                action={{ label: 'Clear search', onClick: () => setQuery('') }}
            />
        ) : (
            <EmptyState icon="orders" compact title="No orders yet" />
        );
    }
    return (
        <ul className="-mx-4 divide-y divide-line">
            {filtered.map((o) => (
                <li key={o.id}>
                    <button
                        type="button"
                        onClick={() => onPick(o)}
                        className="flex min-h-12 w-full items-center gap-3 px-4 py-2.5 text-left transition hover:bg-surface-subtle focus-visible:bg-surface-subtle focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
                    >
                        <span className="min-w-0 flex-1">
                            <span className="block truncate font-medium text-ink">
                                <span>{(o.client && o.client.name) || 'Unknown client'}</span>
                                <RecordNo className="ml-2">{o.orderNumber}</RecordNo>
                            </span>
                            <span className="block truncate text-sm text-ink-muted">{o.serviceName}</span>
                        </span>
                        <Badge tone={ORDER_STATUS_TONE[o.status]}>{orderStatusLabel(o.status)}</Badge>
                    </button>
                </li>
            ))}
        </ul>
    );
}

function OrderSheet({ title, hasValue, onPick, onClear, onClose }) {
    const titleId = useId();
    const orders = useOrders();
    const [query, setQuery] = useState('');

    useEffect(() => {
        const onKey = (e) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [onClose]);

    return (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
            <button type="button" aria-label="Close" tabIndex={-1} onClick={onClose} className="absolute inset-0 bg-ink/40" />
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                className="relative flex max-h-[85vh] w-full max-w-lg flex-col rounded-t-card bg-surface pb-[env(safe-area-inset-bottom)] shadow-overlay sm:rounded-card"
            >
                <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
                    <h2 id={titleId} className="text-lg font-semibold text-ink">
                        {title}
                    </h2>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label="Close"
                        className="flex h-9 w-9 items-center justify-center rounded-control text-ink-muted hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-accent"
                    >
                        <Icon name="close" />
                    </button>
                </div>
                <div className="flex flex-col gap-2 px-4 pt-3 pb-2">
                    <SearchInput value={query} onChange={setQuery} placeholder="Search order number, client or service" />
                    {hasValue && (
                        <button type="button" onClick={onClear} className="self-start text-sm font-medium text-ink underline-offset-2 hover:underline focus-visible:underline">
                            No related order
                        </button>
                    )}
                </div>
                <div className="min-h-32 overflow-y-auto border-t border-line px-4 pt-3 pb-2">
                    <DataView resource={orders} compact loaderRows={3}>
                        {(data) => <OrderRows orders={data} query={query} setQuery={setQuery} onPick={onPick} />}
                    </DataView>
                </div>
            </div>
        </div>
    );
}

/**
 * Optional field that opens a sheet to choose an order (related order on an invoice).
 * value / onChange use { id, orderNumber, clientName } (null when none). Picking an order passes
 * the full Order list item as the second argument.
 */
export default function OrderPicker({
    label = 'Related order',
    value,
    onChange,
    error,
    hint,
    disabled = false,
    sheetTitle = 'Choose an order',
    className = '',
}) {
    const fieldId = useId();
    const messageId = `${fieldId}-msg`;
    const [open, setOpen] = useState(false);

    const pick = (next, order) => {
        setOpen(false);
        if (onChange) onChange(next, order);
    };

    return (
        <div className={`flex flex-col gap-1.5 ${className}`}>
            <FieldLabel htmlFor={fieldId} label={label} />
            <button
                id={fieldId}
                type="button"
                disabled={disabled}
                onClick={() => setOpen(true)}
                aria-invalid={error ? 'true' : undefined}
                aria-describedby={error || hint ? messageId : undefined}
                className={`flex min-h-11 items-center gap-2 text-left ${controlClass(Boolean(error))}`}
            >
                <span className={`min-w-0 flex-1 truncate ${value ? 'text-ink' : 'text-ink-subtle'}`}>
                    {value ? (
                        <>
                            {value.clientName && <span className="mr-2">{value.clientName}</span>}
                            <RecordNo>{value.orderNumber || 'Order'}</RecordNo>
                        </>
                    ) : (
                        'No related order'
                    )}
                </span>
                <Icon name="chevron-right" size="sm" className="shrink-0 text-ink-muted" />
            </button>
            <FieldMessage id={messageId} error={error} hint={hint} />
            {open && (
                <OrderSheet
                    title={sheetTitle}
                    hasValue={Boolean(value)}
                    onClose={() => setOpen(false)}
                    onClear={() => pick(null, null)}
                    onPick={(o) => pick({ id: o.id, orderNumber: o.orderNumber, clientName: (o.client && o.client.name) || null }, o)}
                />
            )}
        </div>
    );
}
