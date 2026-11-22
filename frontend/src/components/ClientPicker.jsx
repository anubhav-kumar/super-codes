import { useEffect, useId, useMemo, useState } from 'react';
import { entityTypeLabel } from '../constants/clients.js';
import { useCompanies } from '../hooks/useCompanies.js';
import { usePeople } from '../hooks/usePeople.js';
import { matchesSearch } from '../utils/search.js';
import DataView from './DataView.jsx';
import EmptyState from './EmptyState.jsx';
import { controlClass, FieldLabel, FieldMessage } from './fieldStyles.jsx';
import Icon from './Icon.jsx';
import SearchInput from './SearchInput.jsx';
import SegmentedControl from './SegmentedControl.jsx';

/** Value shape: { type: 'PERSON' | 'COMPANY', id, name } or null. */

const TABS = [
    { value: 'PERSON', label: 'People' },
    { value: 'COMPANY', label: 'Companies' },
];

const PERSON_FIELDS = ['name', 'pan', 'phone', 'email'];
const COMPANY_FIELDS = ['name', 'pan', 'gstin'];

function Rows({ items, fields, query, setQuery, subtitle, emptyTitle, emptyText, onPick }) {
    const filtered = useMemo(() => (items || []).filter((x) => matchesSearch(x, query, fields)), [items, query, fields]);
    if (filtered.length === 0) {
        return query.trim() ? (
            <EmptyState
                icon="search"
                compact
                title={`No matches for “${query.trim()}”`}
                action={{ label: 'Clear search', onClick: () => setQuery('') }}
            />
        ) : (
            <EmptyState icon="clients" compact title={emptyTitle} text={emptyText} />
        );
    }
    return (
        <ul className="-mx-4 divide-y divide-line">
            {filtered.map((x) => (
                <li key={x.id}>
                    <button
                        type="button"
                        onClick={() => onPick(x)}
                        className="flex min-h-12 w-full items-center gap-3 px-4 py-2.5 text-left transition hover:bg-surface-subtle focus-visible:bg-surface-subtle focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
                    >
                        <span className="min-w-0 flex-1">
                            <span className="block truncate font-medium text-ink">{x.name}</span>
                            {subtitle(x) && <span className="block truncate text-sm text-ink-muted">{subtitle(x)}</span>}
                        </span>
                    </button>
                </li>
            ))}
        </ul>
    );
}

function ClientSheet({ title, initialTab, anyPerson, onPick, onClose }) {
    const titleId = useId();
    const people = usePeople();
    const companies = useCompanies();
    const [tab, setTab] = useState(initialTab || 'PERSON');
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
                    <SegmentedControl label="Client type" options={TABS} value={tab} onChange={setTab} />
                    <SearchInput
                        value={query}
                        onChange={setQuery}
                        placeholder={tab === 'PERSON' ? 'Search name, PAN or phone' : 'Search name or PAN'}
                    />
                </div>
                <div className="min-h-32 overflow-y-auto border-t border-line px-4 pt-3 pb-2">
                    {tab === 'PERSON' ? (
                        <DataView resource={people} compact loaderRows={3}>
                            {(data) => (
                                <Rows
                                    items={anyPerson ? data : (data || []).filter((p) => p.isIndividualClient)}
                                    fields={PERSON_FIELDS}
                                    query={query}
                                    setQuery={setQuery}
                                    subtitle={(p) => [p.pan, p.phone].filter(Boolean).join(' · ')}
                                    emptyTitle={anyPerson ? 'No people yet' : 'No individual clients yet'}
                                    emptyText={anyPerson ? undefined : 'Only people marked as individual clients can be order clients.'}
                                    onPick={(p) => onPick({ type: 'PERSON', id: p.id, name: p.name })}
                                />
                            )}
                        </DataView>
                    ) : (
                        <DataView resource={companies} compact loaderRows={3}>
                            {(data) => (
                                <Rows
                                    items={data}
                                    fields={COMPANY_FIELDS}
                                    query={query}
                                    setQuery={setQuery}
                                    subtitle={(c) => [entityTypeLabel(c.entityType), c.pan].filter(Boolean).join(' · ')}
                                    emptyTitle="No companies yet"
                                    onPick={(c) => onPick({ type: 'COMPANY', id: c.id, name: c.name })}
                                />
                            )}
                        </DataView>
                    )}
                </div>
            </div>
        </div>
    );
}

/**
 * Field that opens a sheet to choose an order client: an individual-client person or a company
 * (two tabs). value / onChange use { type: 'PERSON' | 'COMPANY', id, name } (null when empty).
 * `anyPerson` offers every person, not only individual clients (invoice billed-to).
 */
export default function ClientPicker({
    label = 'Client',
    value,
    onChange,
    error,
    hint,
    required = false,
    disabled = false,
    sheetTitle = 'Choose a client',
    anyPerson = false,
    className = '',
}) {
    const fieldId = useId();
    const messageId = `${fieldId}-msg`;
    const [open, setOpen] = useState(false);

    return (
        <div className={`flex flex-col gap-1.5 ${className}`}>
            <FieldLabel htmlFor={fieldId} label={label} required={required} />
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
                    {value ? value.name || 'Unnamed client' : 'Choose a client'}
                </span>
                {value && <span className="shrink-0 text-xs text-ink-muted">{value.type === 'COMPANY' ? 'Company' : 'Person'}</span>}
                <Icon name="chevron-right" size="sm" className="shrink-0 text-ink-muted" />
            </button>
            <FieldMessage id={messageId} error={error} hint={hint} />
            {open && (
                <ClientSheet
                    title={sheetTitle}
                    initialTab={value ? value.type : 'PERSON'}
                    anyPerson={anyPerson}
                    onClose={() => setOpen(false)}
                    onPick={(picked) => {
                        setOpen(false);
                        if (onChange) onChange(picked);
                    }}
                />
            )}
        </div>
    );
}
