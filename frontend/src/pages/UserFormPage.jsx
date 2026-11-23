import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Button from '../components/Button.jsx';
import EmptyState from '../components/EmptyState.jsx';
import FormFooter from '../components/FormFooter.jsx';
import FormLayout, { FormHeading } from '../components/FormLayout.jsx';
import FormSection from '../components/FormSection.jsx';
import PageBody from '../components/PageBody.jsx';
import PageHeader from '../components/PageHeader.jsx';
import Switch from '../components/Switch.jsx';
import TextField from '../components/TextField.jsx';
import { TemporaryPasswordPanel } from '../components/users/TemporaryPasswordSheet.jsx';
import WorkerLinkField, { linkableWorkers, WORKER_NEW, WORKER_NONE } from '../components/users/WorkerLinkField.jsx';
import { createUser } from '../api/users.js';
import { createWorker } from '../api/workers.js';
import useOnlineStatus from '../hooks/useOnlineStatus.js';
import useSubmit from '../hooks/useSubmit.js';
import { useUsers } from '../hooks/useUsers.js';
import { useWorkers } from '../hooks/useWorkers.js';
import { isValidEmail } from '../utils/validation.js';

const ADMIN_HINT = 'Admins manage users, billing and every record. Members see only their assigned orders.';
const WORKER_LINKED = 'This worker is linked to another user. Choose another.';

function validate(form) {
    const errors = {};
    const name = form.name.trim();
    if (!name) errors.name = 'Enter a name';
    else if (name.length > 100) errors.name = 'Name can be at most 100 characters';
    const email = form.email.trim();
    if (!email) errors.email = 'Enter an email';
    else if (!isValidEmail(email)) errors.email = 'Enter a valid email';
    return errors;
}

/** Server field errors placed on the form's fields (the API names the Worker field `workerId`). */
function placeServerErrors(fieldErrors, error) {
    const placed = { ...fieldErrors };
    if (placed.workerId) {
        placed.worker = error && error.code === 'WORKER_ALREADY_LINKED' ? WORKER_LINKED : placed.workerId;
        delete placed.workerId;
    }
    return placed;
}

/**
 * Add user form (F-49). On save: when "New worker" is chosen, POST /workers first (designation
 * Other, the user's name), then POST /auth/users with that worker id. Both ids are generated once per
 * form, so a retry after a failure (e.g. email taken) reuses the same Worker and the same user.
 * Then the form is replaced in place by the temporary password, held only in this component's state.
 */
function AddUserForm() {
    const navigate = useNavigate();
    const users = useUsers();
    const workers = useWorkers();
    const userId = useRef(crypto.randomUUID());
    const newWorkerId = useRef(crypto.randomUUID());
    const [form, setForm] = useState({ name: '', email: '', isAdmin: false, worker: WORKER_NONE });
    const [localErrors, setLocalErrors] = useState({});
    const [serverErrors, setServerErrors] = useState({});
    // { user, temporaryPassword, temporaryPasswordExpiresAt } after a successful add; never stored elsewhere.
    const [added, setAdded] = useState(null);
    const { submit, submitting, formError } = useSubmit({ errorToast: true });

    const options = useMemo(() => linkableWorkers(workers.data, users.data), [workers.data, users.data]);
    const optionsLoading = workers.status === 'loading' || users.status === 'loading';

    const set = (field) => (value) => {
        setForm((f) => ({ ...f, [field]: value }));
        if (localErrors[field]) setLocalErrors((e) => ({ ...e, [field]: undefined }));
        if (serverErrors[field]) setServerErrors((e) => ({ ...e, [field]: undefined }));
    };
    const errorOf = (field) => localErrors[field] || serverErrors[field];

    const handleSubmit = async (e) => {
        e.preventDefault();
        const errors = validate(form);
        setLocalErrors(errors);
        setServerErrors({});
        if (Object.keys(errors).length) return;
        const name = form.name.trim();
        const result = await submit(async () => {
            let workerId = null;
            if (form.worker === WORKER_NEW) {
                // POST /workers is idempotent on id: a retry returns the Worker created the first time.
                await createWorker({ id: newWorkerId.current, name, designation: 'OTHER' });
                workerId = newWorkerId.current;
            } else if (form.worker !== WORKER_NONE) {
                workerId = form.worker;
            }
            return createUser({ id: userId.current, name, email: form.email.trim(), isAdmin: form.isAdmin, workerId });
        });
        if (!result.ok) {
            const fields = {};
            for (const d of (result.error && result.error.details) || []) {
                if (d && d.field && !fields[d.field]) fields[d.field] = d.message;
            }
            setServerErrors(placeServerErrors(fields, result.error));
            return;
        }
        const data = result.data || {};
        setAdded({
            user: data.user || { id: userId.current, name },
            temporaryPassword: data.temporaryPassword || null,
            temporaryPasswordExpiresAt: data.temporaryPasswordExpiresAt || null,
        });
    };

    if (added) {
        const done = () => navigate(`/users/${added.user.id}`, { replace: true });
        return (
            <div>
                <FormHeading title="User added" meta={added.user.name} />
                <section className="flex flex-col gap-4 rounded-card border border-line bg-surface p-4 md:p-5">
                    {added.temporaryPassword ? (
                        <TemporaryPasswordPanel
                            name={added.user.name}
                            password={added.temporaryPassword}
                            expiresAt={added.temporaryPasswordExpiresAt}
                        />
                    ) : (
                        // 200 on a retried add: the user exists, but the password is never sent twice.
                        <p className="text-sm text-ink-muted">
                            This user was already added. The temporary password can&apos;t be shown again. Use Reset
                            password on the user to get a new one.
                        </p>
                    )}
                    <div className="flex justify-end">
                        <Button onClick={done}>Done</Button>
                    </div>
                </section>
            </div>
        );
    }

    return (
        <FormLayout
            title="Add user"
            error={formError}
            onSubmit={handleSubmit}
            footer={<FormFooter submitLabel="Add user" submitting={submitting} cancelTo="/users" />}
        >
            <FormSection title="Account">
                <TextField label="Name" required autoComplete="off" value={form.name} onChange={set('name')} error={errorOf('name')} />
                <TextField
                    label="Email"
                    required
                    type="email"
                    inputMode="email"
                    autoComplete="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    value={form.email}
                    onChange={set('email')}
                    error={errorOf('email')}
                />
            </FormSection>
            <FormSection title="Access">
                <Switch label="Admin" checked={form.isAdmin} onChange={set('isAdmin')} hint={ADMIN_HINT} />
                {errorOf('isAdmin') && <p className="text-sm text-danger">{errorOf('isAdmin')}</p>}
            </FormSection>
            <FormSection title="Worker">
                <WorkerLinkField
                    value={form.worker}
                    onChange={set('worker')}
                    name={form.name}
                    workers={options}
                    loading={optionsLoading}
                    error={errorOf('worker')}
                />
            </FormSection>
        </FormLayout>
    );
}

/** Add user (/users/new), F-49, admin only via the route guard. Online only. */
export default function UserFormPage() {
    const navigate = useNavigate();
    const { online } = useOnlineStatus();
    // A form opened while offline shows the "needs a connection" state until the app is online once.
    const [everOnline, setEverOnline] = useState(online);
    useEffect(() => {
        if (online) setEverOnline(true);
    }, [online]);

    return (
        <PageBody width="form">
            <PageHeader backTo="/users" backLabel="Users" />
            {everOnline ? (
                <AddUserForm />
            ) : (
                <>
                    <FormHeading title="Add user" />
                    <EmptyState
                        icon="offline"
                        title="Adding users needs a connection"
                        text="Connect to the internet and try again."
                        action={{ label: 'Go back', onClick: () => navigate('/users') }}
                    />
                </>
            )}
        </PageBody>
    );
}
