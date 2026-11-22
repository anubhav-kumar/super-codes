import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import Button from '../components/Button.jsx';
import DataView from '../components/DataView.jsx';
import EmptyState from '../components/EmptyState.jsx';
import FormFooter from '../components/FormFooter.jsx';
import FormLayout from '../components/FormLayout.jsx';
import FormSection, { FormRow } from '../components/FormSection.jsx';
import Icon from '../components/Icon.jsx';
import PageBody from '../components/PageBody.jsx';
import PageHeader from '../components/PageHeader.jsx';
import PersonPicker, { pickedPersonId, toAssociationInput } from '../components/PersonPicker.jsx';
import SelectField from '../components/SelectField.jsx';
import TextArea from '../components/TextArea.jsx';
import TextField from '../components/TextField.jsx';
import { createCompany, updateCompany } from '../api/companies.js';
import { COMPANY_LIMITS, ENTITY_TYPES, RELATIONSHIP_TYPES } from '../constants/clients.js';
import { useCompany } from '../hooks/useCompanies.js';
import useOnlineStatus from '../hooks/useOnlineStatus.js';
import useSubmit from '../hooks/useSubmit.js';
import useToast from '../hooks/useToast.js';
import { isValidEmail, isValidPan, isValidPhone, normalizePan } from '../utils/validation.js';

const GSTIN_RE = /^[0-9A-Z]{15}$/;

const EMPTY = { name: '', pan: '', entityType: '', gstin: '', address: '', email: '', phone: '', notes: '' };

const newRow = () => ({ key: crypto.randomUUID(), person: null, relationshipType: '' });

const toValues = (c) => ({
    name: c.name || '',
    pan: c.pan || '',
    entityType: c.entityType || '',
    gstin: c.gstin || '',
    address: c.address || '',
    email: c.email || '',
    phone: c.phone || '',
    notes: c.notes || '',
});

const orNull = (v) => {
    const t = v.trim();
    return t === '' ? null : t;
};

/** Request body for create/update: the full editable field set, empty optional fields as null. */
const toBody = (v) => ({
    name: v.name.trim(),
    pan: normalizePan(v.pan),
    entityType: v.entityType,
    gstin: orNull(v.gstin.toUpperCase()),
    address: orNull(v.address),
    email: orNull(v.email),
    phone: orNull(v.phone),
    notes: orNull(v.notes),
});

function validate(v) {
    const errors = {};
    const name = v.name.trim();
    if (!name) errors.name = 'Enter the company name';
    else if (name.length > COMPANY_LIMITS.name) errors.name = `Name can be at most ${COMPANY_LIMITS.name} characters`;

    const pan = normalizePan(v.pan);
    if (!pan) errors.pan = 'Enter the PAN';
    else if (!isValidPan(pan)) errors.pan = 'PAN must look like ABCDE1234F';

    if (!v.entityType) errors.entityType = 'Choose an entity type';

    const gstin = v.gstin.trim().toUpperCase();
    if (gstin.length > COMPANY_LIMITS.gstin) errors.gstin = 'GSTIN can be at most 15 characters';
    else if (gstin && !GSTIN_RE.test(gstin)) errors.gstin = 'GSTIN must be 15 letters or digits';

    if (v.email.trim() && !isValidEmail(v.email)) errors.email = 'Enter a valid email';
    if (v.phone.trim() && (!isValidPhone(v.phone) || v.phone.trim().length > COMPANY_LIMITS.phone)) {
        errors.phone = 'Enter a valid phone number';
    }
    if (v.address.trim().length > COMPANY_LIMITS.address) errors.address = `Address can be at most ${COMPANY_LIMITS.address} characters`;
    if (v.notes.trim().length > COMPANY_LIMITS.notes) errors.notes = `Notes can be at most ${COMPANY_LIMITS.notes} characters`;
    return errors;
}

/** Errors per association row: { [rowKey]: { person, relationshipType } }, plus `block` for the whole list. */
function validateRows(rows) {
    const errors = {};
    let block = null;
    if (rows.length === 0 || rows.every((r) => !r.person)) block = 'Add at least one associated person';
    const seen = new Set();
    rows.forEach((row) => {
        const e = {};
        if (!row.person) e.person = 'Choose a person';
        else {
            const id = pickedPersonId(row.person);
            if (seen.has(id)) e.person = 'This person is already linked';
            seen.add(id);
        }
        if (!row.relationshipType) e.relationshipType = 'Choose a relationship type';
        if (e.person || e.relationshipType) errors[row.key] = e;
    });
    return { rows: errors, block };
}

/** Server details for associations[i] -> { person, relationshipType } messages. */
function serverRowErrors(fieldErrors, index) {
    const prefix = `associations[${index}]`;
    let person;
    let relationshipType;
    for (const [field, message] of Object.entries(fieldErrors)) {
        if (!field.startsWith(prefix)) continue;
        if (field === `${prefix}.relationshipType`) relationshipType = relationshipType || message;
        else person = person || message;
    }
    return { person, relationshipType };
}

function AssociationRows({ rows, setRows, rowErrors, fieldErrors, blockError }) {
    const update = (key, patch) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));
    const remove = (key) => setRows((rs) => rs.filter((r) => r.key !== key));
    const pickedIds = rows.map((r) => pickedPersonId(r.person)).filter(Boolean);

    return (
        <FormSection title="People" description="Add at least one person who represents this company.">
            {blockError && (
                <p role="alert" className="text-sm text-danger">
                    {blockError}
                </p>
            )}
            <ol className="flex flex-col gap-3">
                {rows.map((row, index) => {
                    const local = rowErrors[row.key] || {};
                    const server = serverRowErrors(fieldErrors, index);
                    const ownId = pickedPersonId(row.person);
                    return (
                        <li key={row.key} className="flex flex-col gap-3 rounded-control border border-line p-3">
                            <div className="flex items-center justify-between">
                                <span className="text-sm font-medium text-ink-muted">Person {index + 1}</span>
                                {rows.length > 1 && (
                                    <button
                                        type="button"
                                        onClick={() => remove(row.key)}
                                        aria-label={`Remove person ${index + 1}`}
                                        className="flex h-9 w-9 items-center justify-center rounded-control text-ink-muted hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-accent"
                                    >
                                        <Icon name="close" size="sm" />
                                    </button>
                                )}
                            </div>
                            <PersonPicker
                                label="Person"
                                required
                                allowQuickAdd
                                value={row.person}
                                onChange={(person) => update(row.key, { person })}
                                excludeIds={pickedIds.filter((id) => id !== ownId)}
                                error={local.person || server.person}
                            />
                            <SelectField
                                label="Relationship"
                                required
                                placeholder="Choose…"
                                options={RELATIONSHIP_TYPES}
                                value={row.relationshipType}
                                onChange={(relationshipType) => update(row.key, { relationshipType })}
                                error={local.relationshipType || server.relationshipType}
                            />
                        </li>
                    );
                })}
            </ol>
            {rows.length < COMPANY_LIMITS.associations && (
                <Button variant="ghost" icon="plus" className="self-start" onClick={() => setRows((rs) => [...rs, newRow()])}>
                    Add another person
                </Button>
            )}
        </FormSection>
    );
}

function CompanyForm({ company }) {
    const navigate = useNavigate();
    const isEdit = Boolean(company);
    // Client-generated id, kept for the life of the form so a retried create is idempotent.
    const [newId] = useState(() => crypto.randomUUID());
    const [values, setValues] = useState(() => (company ? toValues(company) : EMPTY));
    const [rows, setRows] = useState(() => [newRow()]);
    const [localErrors, setLocalErrors] = useState({});
    const [rowErrors, setRowErrors] = useState({ rows: {}, block: null });
    const [panTaken, setPanTaken] = useState(null);
    const { submit, submitting, formError, fieldErrors } = useSubmit({ errorToast: true });
    const toast = useToast();

    const set = (field) => (value) => {
        setValues((v) => ({ ...v, [field]: value }));
        if (localErrors[field]) setLocalErrors((e) => ({ ...e, [field]: undefined }));
        if (field === 'pan' && panTaken) setPanTaken(null);
    };

    const setRowsAndClear = (updater) => {
        setRows(updater);
        setRowErrors({ rows: {}, block: null });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        const errors = validate(values);
        const assoc = isEdit ? { rows: {}, block: null } : validateRows(rows);
        setLocalErrors(errors);
        setRowErrors(assoc);
        setPanTaken(null);
        if (Object.keys(errors).length || Object.keys(assoc.rows).length || assoc.block) return;

        const body = toBody(values);
        const result = await submit(() =>
            isEdit
                ? updateCompany(company.id, body)
                : createCompany({
                      id: newId,
                      ...body,
                      associations: rows.map((r) => toAssociationInput(r.person, r.relationshipType)),
                  })
        );
        if (result.ok) {
            const id = (result.data && result.data.id) || (isEdit ? company.id : newId);
            const name = (result.data && result.data.name) || body.name;
            toast.success(isEdit ? 'Changes saved' : name ? `${name} added` : 'Company added');
            navigate(`/companies/${id}`, { replace: true });
        } else if (result.error && result.error.code === 'PAN_TAKEN') {
            setPanTaken(result.error.message || 'A company with this PAN already exists');
        }
    };

    const errorFor = (field) => localErrors[field] || fieldErrors[field];
    const panError = localErrors.pan || panTaken || fieldErrors.pan;
    const banner = panTaken ? null : formError;

    return (
        <FormLayout
            title={isEdit ? 'Edit company' : 'Add company'}
            meta={isEdit ? company.name : undefined}
            error={banner}
            onSubmit={handleSubmit}
            footer={<FormFooter submitLabel="Save" submitting={submitting} cancelTo={isEdit ? `/companies/${company.id}` : '/companies'} />}
        >
            <FormSection title="Company">
                <TextField
                    label="Company name"
                    required
                    autoComplete="off"
                    maxLength={COMPANY_LIMITS.name}
                    value={values.name}
                    onChange={set('name')}
                    error={errorFor('name')}
                />
                <FormRow>
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
                        error={panError}
                    />
                    <SelectField
                        label="Entity type"
                        required
                        placeholder="Choose…"
                        options={ENTITY_TYPES}
                        value={values.entityType}
                        onChange={set('entityType')}
                        error={errorFor('entityType')}
                    />
                </FormRow>
                <TextField
                    label="GSTIN"
                    transform="uppercase"
                    autoCapitalize="characters"
                    autoComplete="off"
                    spellCheck={false}
                    maxLength={COMPANY_LIMITS.gstin}
                    className="[&_input]:font-mono"
                    value={values.gstin}
                    onChange={set('gstin')}
                    error={errorFor('gstin')}
                />
            </FormSection>
            <FormSection title="Contact">
                <FormRow>
                    <TextField
                        label="Phone"
                        type="tel"
                        inputMode="tel"
                        maxLength={COMPANY_LIMITS.phone}
                        value={values.phone}
                        onChange={set('phone')}
                        error={errorFor('phone')}
                    />
                    <TextField
                        label="Email"
                        type="email"
                        inputMode="email"
                        autoCapitalize="none"
                        spellCheck={false}
                        maxLength={COMPANY_LIMITS.email}
                        value={values.email}
                        onChange={set('email')}
                        error={errorFor('email')}
                    />
                </FormRow>
                <TextArea
                    label="Registered address"
                    maxLength={COMPANY_LIMITS.address}
                    value={values.address}
                    onChange={set('address')}
                    error={errorFor('address')}
                />
            </FormSection>
            {!isEdit && (
                <AssociationRows
                    rows={rows}
                    setRows={setRowsAndClear}
                    rowErrors={rowErrors.rows}
                    fieldErrors={fieldErrors}
                    blockError={rowErrors.block || fieldErrors.associations}
                />
            )}
            <FormSection title="Notes">
                <TextArea
                    label="Notes"
                    rows={4}
                    maxLength={COMPANY_LIMITS.notes}
                    value={values.notes}
                    onChange={set('notes')}
                    error={errorFor('notes')}
                />
            </FormSection>
        </FormLayout>
    );
}

function NeedsConnection() {
    const navigate = useNavigate();
    return (
        <EmptyState
            icon="offline"
            title="Adding and editing need a connection"
            text="Connect to the internet and try again."
            action={{ label: 'Go back', onClick: () => navigate(-1) }}
        />
    );
}

function EditCompany({ companyId }) {
    const company = useCompany(companyId);
    return <DataView resource={company} skeleton="form" notFoundTitle="Company not found">{(c) => <CompanyForm key={c.id} company={c} />}</DataView>;
}

/** Add company (/companies/new) and Edit company (/companies/:companyId/edit), F-03. Online only. */
export default function CompanyFormPage() {
    const { companyId } = useParams();
    const { online } = useOnlineStatus();
    // Opened offline -> unavailable. Once shown, the form stays mounted if the connection drops.
    const [hadConnection, setHadConnection] = useState(online);
    useEffect(() => {
        if (online) setHadConnection(true);
    }, [online]);
    return (
        <PageBody width="form">
            <PageHeader backTo={companyId ? `/companies/${companyId}` : '/companies'} backLabel={companyId ? 'Company' : 'Companies'} />
            {!online && !hadConnection ? <NeedsConnection /> : companyId ? <EditCompany companyId={companyId} /> : <CompanyForm />}
        </PageBody>
    );
}
