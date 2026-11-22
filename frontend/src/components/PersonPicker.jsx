import { useEffect, useId, useMemo, useState } from 'react';
import { PERSON_LIMITS } from '../constants/clients.js';
import { usePeople } from '../hooks/usePeople.js';
import { matchesSearch } from '../utils/search.js';
import { isValidEmail, isValidPhone } from '../utils/validation.js';
import Button from './Button.jsx';
import DataView from './DataView.jsx';
import EmptyState from './EmptyState.jsx';
import { controlClass, FieldLabel, FieldMessage } from './fieldStyles.jsx';
import Icon from './Icon.jsx';
import SearchInput from './SearchInput.jsx';
import TextField from './TextField.jsx';

const SEARCH_FIELDS = ['name', 'pan', 'phone', 'email'];

/**
 * Value shapes:
 *   { type: 'existing', personId, name }                      an existing person
 *   { type: 'new', person: { id, name, phone, email } }       quick-added, created on save
 */
export const pickedPersonId = (value) => (!value ? null : value.type === 'new' ? value.person.id : value.personId);
export const pickedPersonName = (value) => (!value ? '' : value.type === 'new' ? value.person.name : value.name);

/** The contract's Association input for a picked person (F-03). */
export function toAssociationInput(value, relationshipType) {
    if (value.type === 'new') return { person: value.person, relationshipType };
    return { personId: value.personId, relationshipType };
}

const orNull = (v) => {
    const t = String(v ?? '').trim();
    return t === '' ? null : t;
};

function QuickAddForm({ initialName, onAdd, onCancel }) {
    const [values, setValues] = useState({ name: initialName || '', phone: '', email: '' });
    const [errors, setErrors] = useState({});
    const set = (field) => (v) => {
        setValues((s) => ({ ...s, [field]: v }));
        if (errors[field]) setErrors((e) => ({ ...e, [field]: undefined }));
    };

    // Not a <form>: the picker can sit inside another form, and forms cannot nest.
    const add = () => {
        const next = {};
        const name = values.name.trim();
        if (!name) next.name = 'Enter a name';
        else if (name.length > PERSON_LIMITS.name) next.name = `Name can be at most ${PERSON_LIMITS.name} characters`;
        if (values.phone.trim() && (!isValidPhone(values.phone) || values.phone.trim().length > PERSON_LIMITS.phone)) {
            next.phone = 'Enter a valid phone number';
        }
        if (values.email.trim() && !isValidEmail(values.email)) next.email = 'Enter a valid email';
        setErrors(next);
        if (Object.keys(next).length) return;
        // Client-generated id: the person is created with the save, and a retried save reuses it.
        onAdd({ id: crypto.randomUUID(), name, phone: orNull(values.phone), email: orNull(values.email) });
    };

    const onKeyDown = (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            add();
        }
    };

    return (
        <div className="flex flex-col gap-3" onKeyDown={onKeyDown}>
            <p className="text-sm text-ink-muted">The person is saved with the company link. They are not an individual client.</p>
            <TextField label="Name" required autoFocus maxLength={PERSON_LIMITS.name} value={values.name} onChange={set('name')} error={errors.name} />
            <TextField
                label="Phone"
                type="tel"
                inputMode="tel"
                maxLength={PERSON_LIMITS.phone}
                value={values.phone}
                onChange={set('phone')}
                error={errors.phone}
            />
            <TextField
                label="Email"
                type="email"
                inputMode="email"
                autoCapitalize="none"
                spellCheck={false}
                maxLength={PERSON_LIMITS.email}
                value={values.email}
                onChange={set('email')}
                error={errors.email}
            />
            <div className="flex justify-end gap-3">
                <Button variant="secondary" onClick={onCancel}>
                    Back to list
                </Button>
                <Button onClick={add}>Add person</Button>
            </div>
        </div>
    );
}

function PersonRow({ person, disabledReason, onPick }) {
    return (
        <li>
            <button
                type="button"
                disabled={Boolean(disabledReason)}
                onClick={() => onPick(person)}
                className="flex min-h-12 w-full items-center gap-3 px-4 py-2.5 text-left transition hover:bg-surface-subtle focus-visible:bg-surface-subtle focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-60"
            >
                <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-ink">{person.name}</span>
                    {(person.phone || person.email) && (
                        <span className="block truncate text-sm text-ink-muted">{person.phone || person.email}</span>
                    )}
                </span>
                {disabledReason && <span className="shrink-0 text-xs text-ink-muted">{disabledReason}</span>}
            </button>
        </li>
    );
}

function PeopleList({ people, query, excludeIds, suggested, onPick, onQuickAdd, allowQuickAdd, setQuery }) {
    const filtered = useMemo(() => (people || []).filter((p) => matchesSearch(p, query, SEARCH_FIELDS)), [people, query]);
    const excluded = useMemo(() => new Set(excludeIds || []), [excludeIds]);
    const suggestedIds = useMemo(() => new Set((suggested && suggested.ids) || []), [suggested]);
    const top = filtered.filter((p) => suggestedIds.has(p.id));
    const rest = filtered.filter((p) => !suggestedIds.has(p.id));
    const reason = (p) => (excluded.has(p.id) ? 'Already linked' : undefined);

    if (filtered.length === 0) {
        return (
            <EmptyState
                icon="search"
                compact
                title={query.trim() ? `No matches for “${query.trim()}”` : 'No people yet'}
                action={
                    allowQuickAdd
                        ? { label: 'Quick add a new person', icon: 'plus', onClick: onQuickAdd }
                        : query.trim()
                          ? { label: 'Clear search', onClick: () => setQuery('') }
                          : undefined
                }
            />
        );
    }

    return (
        <>
            {top.length > 0 && (
                <>
                    <p className="pt-2 pb-1 text-xs font-semibold tracking-wide text-ink-muted uppercase">{suggested.label}</p>
                    <ul className="-mx-4 divide-y divide-line">
                        {top.map((p) => (
                            <PersonRow key={p.id} person={p} disabledReason={reason(p)} onPick={onPick} />
                        ))}
                    </ul>
                    {rest.length > 0 && <p className="pt-2 pb-1 text-xs font-semibold tracking-wide text-ink-muted uppercase">Everyone else</p>}
                </>
            )}
            <ul className="-mx-4 divide-y divide-line">
                {rest.map((p) => (
                    <PersonRow key={p.id} person={p} disabledReason={reason(p)} onPick={onPick} />
                ))}
            </ul>
        </>
    );
}

function PickerSheet({ title, excludeIds, suggested, allowQuickAdd, onPick, onClose }) {
    const titleId = useId();
    const people = usePeople();
    const [query, setQuery] = useState('');
    const [quickAdd, setQuickAdd] = useState(false);

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
                        {quickAdd ? 'Quick add a person' : title}
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

                {quickAdd ? (
                    <div className="overflow-y-auto p-4">
                        <QuickAddForm
                            initialName={query.trim()}
                            onCancel={() => setQuickAdd(false)}
                            onAdd={(person) => onPick({ type: 'new', person })}
                        />
                    </div>
                ) : (
                    <>
                        <div className="flex flex-col gap-2 px-4 pt-3 pb-2">
                            <SearchInput value={query} onChange={setQuery} placeholder="Search name, PAN or phone" />
                            {allowQuickAdd && (
                                <Button variant="ghost" size="sm" icon="plus" className="self-start" onClick={() => setQuickAdd(true)}>
                                    Quick add a new person
                                </Button>
                            )}
                        </div>
                        <div className="min-h-32 overflow-y-auto border-t border-line px-4 pt-3 pb-2">
                            <DataView resource={people} compact loaderRows={3}>
                                {(data) => (
                                    <PeopleList
                                        people={data}
                                        query={query}
                                        setQuery={setQuery}
                                        excludeIds={excludeIds}
                                        suggested={suggested}
                                        allowQuickAdd={allowQuickAdd}
                                        onQuickAdd={() => setQuickAdd(true)}
                                        onPick={(p) => onPick({ type: 'existing', personId: p.id, name: p.name })}
                                    />
                                )}
                            </DataView>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}

/**
 * Field that opens a searchable sheet to choose one person (F-03; reused by orders in P-04).
 *   value / onChange   see the value shapes above (null when nothing is chosen)
 *   excludeIds         person ids shown but not selectable ("Already linked")
 *   suggested          { label, ids } shown first, e.g. people of the client company
 *   allowQuickAdd      adds "Quick add a new person" (name, phone, email)
 */
export default function PersonPicker({
    label = 'Person',
    value,
    onChange,
    error,
    hint,
    required = false,
    disabled = false,
    excludeIds,
    suggested,
    allowQuickAdd = false,
    sheetTitle = 'Choose a person',
    className = '',
}) {
    const fieldId = useId();
    const messageId = `${fieldId}-msg`;
    const [open, setOpen] = useState(false);
    const name = pickedPersonName(value);

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
                <span className={`min-w-0 flex-1 truncate ${name ? 'text-ink' : 'text-ink-subtle'}`}>{name || 'Choose a person'}</span>
                {value && value.type === 'new' && <span className="shrink-0 text-xs text-ink-muted">New</span>}
                <Icon name="chevron-right" size="sm" className="shrink-0 text-ink-muted" />
            </button>
            <FieldMessage id={messageId} error={error} hint={hint} />
            {open && (
                <PickerSheet
                    title={sheetTitle}
                    excludeIds={excludeIds}
                    suggested={suggested}
                    allowQuickAdd={allowQuickAdd}
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
