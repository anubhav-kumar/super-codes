import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import DataView from '../components/DataView.jsx';
import DateField from '../components/DateField.jsx';
import EmptyState from '../components/EmptyState.jsx';
import FormFooter from '../components/FormFooter.jsx';
import FormLayout, { FormHeading } from '../components/FormLayout.jsx';
import FormSection, { FormRow } from '../components/FormSection.jsx';
import PageBody from '../components/PageBody.jsx';
import PageHeader from '../components/PageHeader.jsx';
import SelectField from '../components/SelectField.jsx';
import TextArea from '../components/TextArea.jsx';
import TextField from '../components/TextField.jsx';
import { createWorker, updateWorker } from '../api/workers.js';
import { DESIGNATIONS, WORKER_STATUSES } from '../constants/workers.js';
import useOnlineStatus from '../hooks/useOnlineStatus.js';
import useSubmit from '../hooks/useSubmit.js';
import useToast from '../hooks/useToast.js';
import { useWorker } from '../hooks/useWorkers.js';
import { isValidEmail, isValidPhone } from '../utils/validation.js';

const FIELDS = ['name', 'email', 'phone', 'designation', 'joiningDate', 'status', 'notes'];

function toForm(worker) {
    const form = {};
    for (const f of FIELDS) form[f] = (worker && worker[f]) ?? '';
    if (!form.status) form.status = 'ACTIVE';
    return form;
}

function validate(form) {
    const errors = {};
    const name = form.name.trim();
    if (!name) errors.name = 'Enter a name';
    else if (name.length > 100) errors.name = 'Name can be at most 100 characters';
    if (!form.designation) errors.designation = 'Choose a designation';
    if (form.email.trim() && !isValidEmail(form.email)) errors.email = 'Enter a valid email';
    if (form.phone.trim() && !isValidPhone(form.phone)) errors.phone = 'Enter a valid phone number';
    if (form.notes.length > 2000) errors.notes = 'Notes can be at most 2000 characters';
    return errors;
}

// Full editable field set (PUT clears omitted optional fields, so every field is always sent).
function toBody(form) {
    const opt = (v) => (v.trim() === '' ? null : v.trim());
    return {
        name: form.name.trim(),
        email: opt(form.email),
        phone: opt(form.phone),
        designation: form.designation,
        joiningDate: form.joiningDate || null,
        status: form.status,
        notes: opt(form.notes),
    };
}

function WorkerForm({ worker }) {
    const navigate = useNavigate();
    const isEdit = Boolean(worker);
    // One id per form: a retried create after a dropped connection returns the same worker (200).
    const newId = useRef(isEdit ? null : crypto.randomUUID());
    const [form, setForm] = useState(() => toForm(worker));
    const [localErrors, setLocalErrors] = useState({});
    const { submit, submitting, formError, fieldErrors } = useSubmit({ errorToast: true });
    const toast = useToast();

    const set = (field) => (value) => {
        setForm((f) => ({ ...f, [field]: value }));
        if (localErrors[field]) setLocalErrors((e) => ({ ...e, [field]: undefined }));
    };
    const errorOf = (field) => localErrors[field] || fieldErrors[field];

    const handleSubmit = async (e) => {
        e.preventDefault();
        const errors = validate(form);
        setLocalErrors(errors);
        if (Object.keys(errors).length) return;
        const body = toBody(form);
        const result = await submit(() =>
            isEdit ? updateWorker(worker.id, body) : createWorker({ id: newId.current, ...body })
        );
        if (!result.ok) return;
        const name = (result.data && result.data.name) || body.name;
        toast.success(isEdit ? 'Changes saved' : name ? `${name} added` : 'Worker added');
        navigate(`/workers/${isEdit ? worker.id : newId.current}`, { replace: true });
    };

    const cancelTo = isEdit ? `/workers/${worker.id}` : '/workers';

    return (
        <FormLayout
            title={isEdit ? 'Edit worker' : 'Add worker'}
            meta={isEdit ? worker.name : undefined}
            error={formError}
            onSubmit={handleSubmit}
            footer={<FormFooter submitLabel={isEdit ? 'Save' : 'Add worker'} submitting={submitting} cancelTo={cancelTo} />}
        >
            <FormSection title="Worker">
                <TextField label="Name" required autoComplete="off" value={form.name} onChange={set('name')} error={errorOf('name')} />
                <FormRow>
                    <SelectField
                        label="Designation"
                        required
                        placeholder="Choose a designation"
                        options={DESIGNATIONS}
                        value={form.designation}
                        onChange={set('designation')}
                        error={errorOf('designation')}
                    />
                    <SelectField
                        label="Status"
                        options={WORKER_STATUSES}
                        value={form.status}
                        onChange={set('status')}
                        error={errorOf('status')}
                        hint={form.status === 'INACTIVE' ? "Inactive workers keep their current orders but can't be assigned new ones." : undefined}
                    />
                </FormRow>
            </FormSection>
            <FormSection title="Contact">
                <FormRow>
                    <TextField label="Phone" type="tel" inputMode="tel" value={form.phone} onChange={set('phone')} error={errorOf('phone')} />
                    <TextField
                        label="Email"
                        type="email"
                        inputMode="email"
                        autoCapitalize="none"
                        spellCheck={false}
                        value={form.email}
                        onChange={set('email')}
                        error={errorOf('email')}
                    />
                </FormRow>
            </FormSection>
            <FormSection title="Dates">
                <FormRow>
                    <DateField label="Joining date" value={form.joiningDate} onChange={set('joiningDate')} error={errorOf('joiningDate')} />
                </FormRow>
            </FormSection>
            <FormSection title="Notes">
                <TextArea label="Notes" rows={4} value={form.notes} onChange={set('notes')} error={errorOf('notes')} />
            </FormSection>
        </FormLayout>
    );
}

function EditWorker({ workerId }) {
    const worker = useWorker(workerId);
    return <DataView resource={worker} skeleton="form">{(w) => <WorkerForm worker={w} />}</DataView>;
}

/** Add worker (/workers/new) and Edit worker (/workers/:workerId/edit), F-04. Online only. */
export default function WorkerFormPage() {
    const { workerId } = useParams();
    const navigate = useNavigate();
    const { online } = useOnlineStatus();
    // A form opened while offline shows the "needs a connection" state until the app is online once.
    const [everOnline, setEverOnline] = useState(online);
    useEffect(() => {
        if (online) setEverOnline(true);
    }, [online]);

    const isEdit = Boolean(workerId);
    const title = isEdit ? 'Edit worker' : 'Add worker';

    if (!everOnline) {
        return (
            <PageBody width="form">
                <PageHeader backTo={isEdit ? `/workers/${workerId}` : '/workers'} backLabel={isEdit ? 'Worker' : 'Workers'} />
                <FormHeading title={title} />
                <EmptyState
                    icon="offline"
                    title="Adding and editing need a connection"
                    text="Connect to the internet and try again."
                    action={{ label: 'Go back', onClick: () => navigate(isEdit ? `/workers/${workerId}` : '/workers') }}
                />
            </PageBody>
        );
    }

    return (
        <PageBody width="form">
            <PageHeader backTo={isEdit ? `/workers/${workerId}` : '/workers'} backLabel={isEdit ? 'Worker' : 'Workers'} />
            {isEdit ? <EditWorker workerId={workerId} /> : <WorkerForm />}
        </PageBody>
    );
}
