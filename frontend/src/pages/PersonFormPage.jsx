import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import DataView from '../components/DataView.jsx';
import EmptyState from '../components/EmptyState.jsx';
import FormFooter from '../components/FormFooter.jsx';
import FormLayout from '../components/FormLayout.jsx';
import FormSection, { FormRow } from '../components/FormSection.jsx';
import PageBody from '../components/PageBody.jsx';
import PageHeader from '../components/PageHeader.jsx';
import Switch from '../components/Switch.jsx';
import TextArea from '../components/TextArea.jsx';
import TextField from '../components/TextField.jsx';
import { createPerson, updatePerson } from '../api/people.js';
import { PERSON_LIMITS } from '../constants/clients.js';
import useOnlineStatus from '../hooks/useOnlineStatus.js';
import { usePerson } from '../hooks/usePeople.js';
import useSubmit from '../hooks/useSubmit.js';
import useToast from '../hooks/useToast.js';
import { isValidEmail, isValidPan, isValidPhone, normalizePan } from '../utils/validation.js';

const EMPTY = { name: '', isIndividualClient: false, pan: '', email: '', phone: '', address: '', notes: '' };

const toValues = (p) => ({
    name: p.name || '',
    isIndividualClient: Boolean(p.isIndividualClient),
    pan: p.pan || '',
    email: p.email || '',
    phone: p.phone || '',
    address: p.address || '',
    notes: p.notes || '',
});

const orNull = (v) => {
    const t = v.trim();
    return t === '' ? null : t;
};

/** Request body for create/update: the full editable field set, empty optional fields as null. */
const toBody = (v) => ({
    name: v.name.trim(),
    isIndividualClient: v.isIndividualClient,
    pan: normalizePan(v.pan) || null,
    email: orNull(v.email),
    phone: orNull(v.phone),
    address: orNull(v.address),
    notes: orNull(v.notes),
});

function validate(v) {
    const errors = {};
    const name = v.name.trim();
    if (!name) errors.name = 'Enter a name';
    else if (name.length > PERSON_LIMITS.name) errors.name = `Name can be at most ${PERSON_LIMITS.name} characters`;

    const pan = normalizePan(v.pan);
    if (!pan) {
        if (v.isIndividualClient) errors.pan = 'PAN is required for individual clients';
    } else if (!isValidPan(pan)) {
        errors.pan = 'PAN must look like ABCDE1234F';
    }

    if (v.email.trim() && !isValidEmail(v.email)) errors.email = 'Enter a valid email';
    if (v.phone.trim() && (!isValidPhone(v.phone) || v.phone.trim().length > PERSON_LIMITS.phone)) {
        errors.phone = 'Enter a valid phone number';
    }
    if (v.address.trim().length > PERSON_LIMITS.address) errors.address = `Address can be at most ${PERSON_LIMITS.address} characters`;
    if (v.notes.trim().length > PERSON_LIMITS.notes) errors.notes = `Notes can be at most ${PERSON_LIMITS.notes} characters`;
    return errors;
}

function PersonForm({ person }) {
    const navigate = useNavigate();
    const isEdit = Boolean(person);
    // Client-generated id, kept for the life of the form so a retried create is idempotent.
    const [newId] = useState(() => crypto.randomUUID());
    const [values, setValues] = useState(() => (person ? toValues(person) : EMPTY));
    const [localErrors, setLocalErrors] = useState({});
    const [panTaken, setPanTaken] = useState(null);
    const { submit, submitting, formError, fieldErrors } = useSubmit({ errorToast: true });
    const toast = useToast();

    const set = (field) => (value) => {
        setValues((v) => ({ ...v, [field]: value }));
        if (localErrors[field]) setLocalErrors((e) => ({ ...e, [field]: undefined }));
        if (field === 'isIndividualClient' && localErrors.pan) setLocalErrors((e) => ({ ...e, pan: undefined }));
        if (field === 'pan' && panTaken) setPanTaken(null);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        const errors = validate(values);
        setLocalErrors(errors);
        setPanTaken(null);
        if (Object.keys(errors).length) return;

        const body = toBody(values);
        const result = await submit(() => (isEdit ? updatePerson(person.id, body) : createPerson({ id: newId, ...body })));
        if (result.ok) {
            const id = (result.data && result.data.id) || (isEdit ? person.id : newId);
            const name = (result.data && result.data.name) || body.name;
            toast.success(isEdit ? 'Changes saved' : name ? `${name} added` : 'Person added');
            navigate(`/people/${id}`, { replace: true });
        } else if (result.error && result.error.code === 'PAN_TAKEN') {
            setPanTaken(result.error.message || 'A person with this PAN already exists');
        }
    };

    const errorFor = (field) => localErrors[field] || fieldErrors[field];
    const panError = localErrors.pan || panTaken || fieldErrors.pan;
    const banner = panTaken ? null : formError;

    return (
        <FormLayout
            title={isEdit ? 'Edit person' : 'Add person'}
            meta={isEdit ? person.name : undefined}
            error={banner}
            onSubmit={handleSubmit}
            footer={<FormFooter submitLabel="Save" submitting={submitting} cancelTo={isEdit ? `/people/${person.id}` : '/people'} />}
        >
            <FormSection title="Person">
                <TextField
                    label="Name"
                    required
                    autoComplete="off"
                    maxLength={PERSON_LIMITS.name}
                    value={values.name}
                    onChange={set('name')}
                    error={errorFor('name')}
                />
                <Switch
                    label="Individual client"
                    hint="The firm does work for this person directly."
                    checked={values.isIndividualClient}
                    onChange={set('isIndividualClient')}
                />
                <TextField
                    label="PAN"
                    required={values.isIndividualClient}
                    transform="uppercase"
                    autoCapitalize="characters"
                    autoComplete="off"
                    spellCheck={false}
                    maxLength={10}
                    className="[&_input]:font-mono"
                    value={values.pan}
                    onChange={set('pan')}
                    error={panError}
                    hint={values.isIndividualClient ? undefined : 'Optional for company contacts.'}
                />
            </FormSection>
            <FormSection title="Contact">
                <FormRow>
                    <TextField
                        label="Phone"
                        type="tel"
                        inputMode="tel"
                        maxLength={PERSON_LIMITS.phone}
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
                        maxLength={PERSON_LIMITS.email}
                        value={values.email}
                        onChange={set('email')}
                        error={errorFor('email')}
                    />
                </FormRow>
                <TextArea
                    label="Address"
                    maxLength={PERSON_LIMITS.address}
                    value={values.address}
                    onChange={set('address')}
                    error={errorFor('address')}
                />
            </FormSection>
            <FormSection title="Notes">
                <TextArea
                    label="Notes"
                    rows={4}
                    maxLength={PERSON_LIMITS.notes}
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

function EditPerson({ personId }) {
    const person = usePerson(personId);
    return <DataView resource={person} skeleton="form" notFoundTitle="Person not found">{(p) => <PersonForm key={p.id} person={p} />}</DataView>;
}

/** Add person (/people/new) and Edit person (/people/:personId/edit), F-02. Online only. */
export default function PersonFormPage() {
    const { personId } = useParams();
    const { online } = useOnlineStatus();
    // Opened offline -> unavailable. Once the form has been shown it stays mounted if the connection
    // drops, so typed values are kept (FormFooter disables Save while offline).
    const [hadConnection, setHadConnection] = useState(online);
    useEffect(() => {
        if (online) setHadConnection(true);
    }, [online]);
    return (
        <PageBody width="form">
            <PageHeader backTo={personId ? `/people/${personId}` : '/people'} backLabel={personId ? 'Person' : 'People'} />
            {!online && !hadConnection ? <NeedsConnection /> : personId ? <EditPerson personId={personId} /> : <PersonForm />}
        </PageBody>
    );
}
