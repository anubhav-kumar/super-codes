import { useMemo, useState } from 'react';
import { createCompany } from '../api/companies.js';
import { COMPANY_LIMITS, ENTITY_TYPES, PERSON_LIMITS, RELATIONSHIP_TYPES } from '../constants/clients.js';
import { usePeople } from '../hooks/usePeople.js';
import useSubmit from '../hooks/useSubmit.js';
import { matchesSearch } from '../utils/search.js';
import { isValidPan, isValidPhone, normalizePan } from '../utils/validation.js';
import Button from './Button.jsx';
import ClientIcon from './ClientIcon.jsx';
import DataView from './DataView.jsx';
import EmptyState from './EmptyState.jsx';
import FormError from './FormError.jsx';
import Icon from './Icon.jsx';
import SearchInput from './SearchInput.jsx';
import SegmentedControl from './SegmentedControl.jsx';
import SelectField from './SelectField.jsx';
import TextField from './TextField.jsx';

const CONTACT_MODES = [
    { value: 'existing', label: 'Existing person' },
    { value: 'new', label: 'New person' },
];

const SEARCH_FIELDS = ['name', 'pan', 'phone', 'email'];

/** Embedded people list: pick one existing person as the company contact. */
function ExistingPeople({ selectedId, onSelect, error }) {
    const people = usePeople();
    const [query, setQuery] = useState('');
    return (
        <div className="flex flex-col gap-2">
            <SearchInput value={query} onChange={setQuery} placeholder="Search name, PAN or phone" label="Search people" />
            <div className={`max-h-56 overflow-y-auto rounded-control border ${error ? 'border-danger' : 'border-line'}`}>
                <DataView resource={people} compact loaderRows={3}>
                    {(data) => <PeopleRows people={data} query={query} selectedId={selectedId} onSelect={onSelect} />}
                </DataView>
            </div>
            {error && (
                <p role="alert" className="text-sm text-danger">
                    {error}
                </p>
            )}
        </div>
    );
}

function PeopleRows({ people, query, selectedId, onSelect }) {
    const filtered = useMemo(() => (people || []).filter((p) => matchesSearch(p, query, SEARCH_FIELDS)), [people, query]);
    if (filtered.length === 0) {
        return (
            <EmptyState
                icon="search"
                compact
                title={query.trim() ? `No matches for “${query.trim()}”` : 'No people yet'}
                text="Switch to New person to add one."
            />
        );
    }
    return (
        <ul className="divide-y divide-line" role="listbox" aria-label="People">
            {filtered.map((p) => {
                const selected = p.id === selectedId;
                const line2 = p.pan || p.phone;
                return (
                    <li key={p.id} role="option" aria-selected={selected}>
                        <button
                            type="button"
                            onClick={() => onSelect({ id: p.id, name: p.name })}
                            className={`flex min-h-12 w-full items-center gap-3 px-3 py-2 text-left transition hover:bg-surface-subtle focus-visible:bg-surface-subtle focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent ${selected ? 'bg-surface-subtle' : ''}`}
                        >
                            <ClientIcon type="PERSON" />
                            <span className="min-w-0 flex-1">
                                <span className="block truncate font-medium text-ink">{p.name}</span>
                                {line2 && <span className="block truncate text-sm text-ink-muted">{line2}</span>}
                            </span>
                            {selected && <Icon name="check" size="sm" className="shrink-0 text-ink" />}
                        </button>
                    </li>
                );
            })}
        </ul>
    );
}

/**
 * Client picker quick add (F-18): creates a company with exactly one contact person (F-03 create
 * with one association) and returns { type: 'COMPANY', id, name } through onCreated. The contact is
 * an existing person or a new one (name, phone; created by the company save, not an individual
 * client). Not a <form>: it renders inside a sheet that belongs to another form's field.
 */
export default function QuickAddCompanyForm({ initialName = '', onCreated, onBack }) {
    // Client-generated ids, kept for the life of the form so a retried create is idempotent.
    const [newId] = useState(() => crypto.randomUUID());
    const [newPersonId] = useState(() => crypto.randomUUID());
    const [values, setValues] = useState({ name: initialName, pan: '', entityType: '' });
    const [mode, setMode] = useState('existing');
    const [existing, setExisting] = useState(null);
    const [contact, setContact] = useState({ name: '', phone: '' });
    const [relationshipType, setRelationshipType] = useState('DIRECTOR');
    const [errors, setErrors] = useState({});
    const [panTaken, setPanTaken] = useState(null);
    const { submit, submitting, formError, fieldErrors } = useSubmit();

    const clear = (field) => {
        if (errors[field]) setErrors((e) => ({ ...e, [field]: undefined }));
    };
    const set = (field) => (v) => {
        setValues((s) => ({ ...s, [field]: v }));
        clear(field);
        if (field === 'pan' && panTaken) setPanTaken(null);
    };
    const setContactField = (field) => (v) => {
        setContact((s) => ({ ...s, [field]: v }));
        clear(`contact.${field}`);
    };

    const validate = () => {
        const next = {};
        const name = values.name.trim();
        if (!name) next.name = 'Enter the company name';
        else if (name.length > COMPANY_LIMITS.name) next.name = `Name can be at most ${COMPANY_LIMITS.name} characters`;
        const pan = normalizePan(values.pan);
        if (!pan) next.pan = 'Enter the PAN';
        else if (!isValidPan(pan)) next.pan = 'PAN must look like ABCDE1234F';
        if (!values.entityType) next.entityType = 'Choose an entity type';
        if (mode === 'existing') {
            if (!existing) next.existing = 'Choose a contact person';
        } else {
            const cName = contact.name.trim();
            if (!cName) next['contact.name'] = 'Enter a name';
            else if (cName.length > PERSON_LIMITS.name) next['contact.name'] = `Name can be at most ${PERSON_LIMITS.name} characters`;
            if (contact.phone.trim() && (!isValidPhone(contact.phone) || contact.phone.trim().length > PERSON_LIMITS.phone)) {
                next['contact.phone'] = 'Enter a valid phone number';
            }
        }
        if (!relationshipType) next.relationshipType = 'Choose a relationship type';
        return next;
    };

    const save = async () => {
        const next = validate();
        setErrors(next);
        setPanTaken(null);
        if (Object.keys(next).length) return;

        const association =
            mode === 'existing'
                ? { personId: existing.id, relationshipType }
                : {
                      person: { id: newPersonId, name: contact.name.trim(), phone: contact.phone.trim() || null, email: null },
                      relationshipType,
                  };
        const name = values.name.trim();
        const body = {
            id: newId,
            name,
            pan: normalizePan(values.pan),
            entityType: values.entityType,
            gstin: null,
            address: null,
            email: null,
            phone: null,
            notes: null,
            associations: [association],
        };
        const result = await submit(() => createCompany(body));
        if (result.ok) {
            const created = result.data || {};
            onCreated({ type: 'COMPANY', id: created.id || newId, name: created.name || name });
        } else if (result.error && result.error.code === 'PAN_TAKEN') {
            setPanTaken(result.error.message || 'A company with this PAN already exists');
        }
    };

    const onKeyDown = (e) => {
        if (e.key === 'Enter' && e.target.tagName === 'INPUT' && e.target.type !== 'search') {
            e.preventDefault();
            save();
        }
    };

    // Server details for associations[0].* land on the contact block.
    const serverContactError = Object.entries(fieldErrors).find(([k]) => k.startsWith('associations'));
    const contactError = serverContactError ? serverContactError[1] : undefined;

    return (
        <div className="flex flex-col gap-4 pt-1" onKeyDown={onKeyDown}>
            <FormError message={panTaken ? null : formError} />
            <TextField
                label="Company name"
                required
                autoFocus
                autoComplete="off"
                maxLength={COMPANY_LIMITS.name}
                value={values.name}
                onChange={set('name')}
                error={errors.name || fieldErrors.name}
            />
            <TextField
                label="PAN"
                required
                transform="uppercase"
                autoCapitalize="characters"
                autoComplete="off"
                spellCheck={false}
                maxLength={10}
                className="[&_input]:font-mono"
                value={values.pan}
                onChange={set('pan')}
                error={errors.pan || panTaken || fieldErrors.pan}
            />
            <SelectField
                label="Entity type"
                required
                placeholder="Choose…"
                options={ENTITY_TYPES}
                value={values.entityType}
                onChange={set('entityType')}
                error={errors.entityType || fieldErrors.entityType}
            />

            <fieldset className="flex flex-col gap-3 border-t border-line pt-4">
                <legend className="sr-only">Contact person</legend>
                <p aria-hidden="true" className="text-sm font-semibold text-ink">
                    Contact person
                </p>
                <SegmentedControl label="Contact person" options={CONTACT_MODES} value={mode} onChange={setMode} bleed={false} />
                {mode === 'existing' ? (
                    <ExistingPeople
                        selectedId={existing && existing.id}
                        onSelect={(p) => {
                            setExisting(p);
                            clear('existing');
                        }}
                        error={errors.existing}
                    />
                ) : (
                    <>
                        <TextField
                            label="Name"
                            required
                            autoComplete="off"
                            maxLength={PERSON_LIMITS.name}
                            value={contact.name}
                            onChange={setContactField('name')}
                            error={errors['contact.name']}
                        />
                        <TextField
                            label="Phone"
                            type="tel"
                            inputMode="tel"
                            maxLength={PERSON_LIMITS.phone}
                            value={contact.phone}
                            onChange={setContactField('phone')}
                            error={errors['contact.phone']}
                        />
                    </>
                )}
                <SelectField
                    label="Relationship"
                    required
                    options={RELATIONSHIP_TYPES}
                    value={relationshipType}
                    onChange={(v) => {
                        setRelationshipType(v);
                        clear('relationshipType');
                    }}
                    error={errors.relationshipType || contactError}
                    hint={mode === 'new' ? 'The new person is saved as a company contact, not an individual client.' : undefined}
                />
            </fieldset>

            <div className="flex flex-wrap justify-end gap-2 pt-1">
                <Button variant="secondary" icon="back" onClick={onBack} disabled={submitting}>
                    Back
                </Button>
                <Button onClick={save} loading={submitting}>
                    Add and select
                </Button>
            </div>
        </div>
    );
}
