import { useId, useMemo, useState } from 'react';
import { entityTypeLabel } from '../constants/clients.js';
import { useCompanies } from '../hooks/useCompanies.js';
import useOnlineStatus from '../hooks/useOnlineStatus.js';
import { usePeople } from '../hooks/usePeople.js';
import useToast from '../hooks/useToast.js';
import { matchesSearch } from '../utils/search.js';
import ClientIcon from './ClientIcon.jsx';
import DataView from './DataView.jsx';
import EmptyState from './EmptyState.jsx';
import { controlClass, FieldLabel, FieldMessage } from './fieldStyles.jsx';
import Icon from './Icon.jsx';
import QuickAddCompanyForm from './QuickAddCompanyForm.jsx';
import QuickAddPersonForm from './QuickAddPersonForm.jsx';
import SearchInput from './SearchInput.jsx';
import SegmentedControl from './SegmentedControl.jsx';
import Sheet from './Sheet.jsx';

/** Value shape: { type: 'PERSON' | 'COMPANY', id, name } or null. */

const TABS = [
    { value: 'PERSON', label: 'People' },
    { value: 'COMPANY', label: 'Companies' },
];

const PERSON_FIELDS = ['name', 'pan', 'phone', 'email'];
const COMPANY_FIELDS = ['name', 'pan', 'gstin'];

const rowClass =
    'flex min-h-12 w-full items-center gap-3 px-4 py-2.5 text-left transition hover:bg-surface-subtle focus-visible:bg-surface-subtle focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent';

function Rows({ type, items, fields, query, setQuery, subtitle, emptyTitle, emptyText, onPick }) {
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
        <ul className="-mx-4 divide-y divide-line md:-mx-5">
            {filtered.map((x) => (
                <li key={x.id}>
                    <button type="button" onClick={() => onPick(x)} className={`${rowClass} md:px-5`}>
                        <ClientIcon type={type} />
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

/** "Add new person" / "Add new company" rows at the top of the sheet. Online only. */
function QuickAddRows({ online, onAdd }) {
    const rows = [
        { mode: 'PERSON', icon: 'add-person', label: 'Add new person' },
        { mode: 'COMPANY', icon: 'add-company', label: 'Add new company' },
    ];
    return (
        <div className="flex flex-col">
            <ul className="-mx-4 md:-mx-5">
                {rows.map((r) => (
                    <li key={r.mode}>
                        <button
                            type="button"
                            disabled={!online}
                            onClick={() => onAdd(r.mode)}
                            className={`${rowClass} md:px-5 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-transparent`}
                        >
                            <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-line text-ink">
                                <Icon name={r.icon} size="sm" />
                            </span>
                            <span className="min-w-0 flex-1 font-medium text-ink">{r.label}</span>
                            <Icon name="chevron-right" size="sm" className="shrink-0 text-ink-subtle" />
                        </button>
                    </li>
                ))}
            </ul>
            {!online && <p className="pb-1 text-sm text-ink-muted">Connect to the internet to add a client.</p>}
        </div>
    );
}

function ClientSheet({ title, initialTab, anyPerson, onPick, onClose }) {
    const people = usePeople();
    const companies = useCompanies();
    const { online } = useOnlineStatus();
    const toast = useToast();
    const [tab, setTab] = useState(initialTab || 'PERSON');
    const [query, setQuery] = useState('');
    // null = the list; 'PERSON' / 'COMPANY' = the quick add form. The list keeps tab and query.
    const [adding, setAdding] = useState(null);

    const onCreated = (client) => {
        toast.success(client.name ? `${client.name} added` : client.type === 'COMPANY' ? 'Company added' : 'Person added');
        // The lists reload the next time the sheet opens (it mounts fresh), so the new client shows.
        onPick(client);
    };

    if (adding) {
        // Typed search text is a good first guess for the name.
        const initialName = query.trim();
        return (
            <Sheet open title={adding === 'COMPANY' ? 'Add new company' : 'Add new person'} onClose={onClose}>
                {adding === 'COMPANY' ? (
                    <QuickAddCompanyForm initialName={initialName} onBack={() => setAdding(null)} onCreated={onCreated} />
                ) : (
                    <QuickAddPersonForm initialName={initialName} onBack={() => setAdding(null)} onCreated={onCreated} />
                )}
            </Sheet>
        );
    }

    return (
        <Sheet open title={title} onClose={onClose}>
            <QuickAddRows online={online} onAdd={setAdding} />
            <div className="sticky top-0 z-10 -mx-4 flex flex-col gap-2 border-y border-line bg-surface px-4 py-3 md:-mx-5 md:px-5">
                <SegmentedControl label="Client type" options={TABS} value={tab} onChange={setTab} />
                <SearchInput
                    value={query}
                    onChange={setQuery}
                    placeholder={tab === 'PERSON' ? 'Search name, PAN or phone' : 'Search name or PAN'}
                />
            </div>
            <div className="min-h-32 pt-1">
                {tab === 'PERSON' ? (
                    <DataView resource={people} compact loaderRows={3}>
                        {(data) => (
                            <Rows
                                type="PERSON"
                                items={anyPerson ? data : (data || []).filter((p) => p.isIndividualClient)}
                                fields={PERSON_FIELDS}
                                query={query}
                                setQuery={setQuery}
                                subtitle={(p) => p.pan || p.phone}
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
                                type="COMPANY"
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
        </Sheet>
    );
}

/**
 * Field that opens a sheet to choose a client: a person or a company (two tabs), with
 * "Add new person" / "Add new company" quick add at the top (F-18; online only).
 *   value / onChange  { type: 'PERSON' | 'COMPANY', id, name } (null when empty)
 *   anyPerson         offer every person, not only individual clients (invoice billed-to)
 *   loading           shows "Loading client…" and disables the field (preselect from the URL)
 * Quick add only returns the new client through onChange; the parent form keeps all its state.
 */
export default function ClientPicker({
    label = 'Client',
    value,
    onChange,
    error,
    hint,
    required = false,
    disabled = false,
    loading = false,
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
                disabled={disabled || loading}
                aria-busy={loading || undefined}
                onClick={() => setOpen(true)}
                aria-invalid={error ? 'true' : undefined}
                aria-describedby={error || hint ? messageId : undefined}
                className={`flex min-h-11 items-center gap-2 text-left ${controlClass(Boolean(error))}`}
            >
                {loading ? (
                    <>
                        <span aria-hidden="true" className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-ink-subtle border-r-transparent" />
                        <span className="min-w-0 flex-1 truncate text-ink-subtle">Loading client…</span>
                    </>
                ) : (
                    <>
                        {value && <ClientIcon type={value.type} size="inline" />}
                        <span className={`min-w-0 flex-1 truncate ${value ? 'text-ink' : 'text-ink-subtle'}`}>
                            {value ? value.name || 'Unnamed client' : 'Choose a client'}
                        </span>
                        {value && <span className="shrink-0 text-xs text-ink-muted">{value.type === 'COMPANY' ? 'Company' : 'Person'}</span>}
                    </>
                )}
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
