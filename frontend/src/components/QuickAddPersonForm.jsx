import { useState } from 'react';
import { createPerson } from '../api/people.js';
import { PERSON_LIMITS } from '../constants/clients.js';
import useSubmit from '../hooks/useSubmit.js';
import { isValidPan, isValidPhone, normalizePan } from '../utils/validation.js';
import Button from './Button.jsx';
import FormError from './FormError.jsx';
import TextField from './TextField.jsx';

/**
 * Client picker quick add (F-18): creates an individual client (F-02 create) and returns
 * { type: 'PERSON', id, name } through onCreated. Not a <form>: it renders inside a sheet that
 * belongs to another form's field, and React events bubble through portals.
 */
export default function QuickAddPersonForm({ initialName = '', onCreated, onBack }) {
    // Client-generated id, kept for the life of the form so a retried create is idempotent.
    const [newId] = useState(() => crypto.randomUUID());
    const [values, setValues] = useState({ name: initialName, pan: '', phone: '' });
    const [errors, setErrors] = useState({});
    const [panTaken, setPanTaken] = useState(null);
    const { submit, submitting, formError, fieldErrors } = useSubmit();

    const set = (field) => (v) => {
        setValues((s) => ({ ...s, [field]: v }));
        if (errors[field]) setErrors((e) => ({ ...e, [field]: undefined }));
        if (field === 'pan' && panTaken) setPanTaken(null);
    };

    const save = async () => {
        const next = {};
        const name = values.name.trim();
        if (!name) next.name = 'Enter a name';
        else if (name.length > PERSON_LIMITS.name) next.name = `Name can be at most ${PERSON_LIMITS.name} characters`;
        const pan = normalizePan(values.pan);
        if (!pan) next.pan = 'PAN is required for individual clients';
        else if (!isValidPan(pan)) next.pan = 'PAN must look like ABCDE1234F';
        if (values.phone.trim() && (!isValidPhone(values.phone) || values.phone.trim().length > PERSON_LIMITS.phone)) {
            next.phone = 'Enter a valid phone number';
        }
        setErrors(next);
        setPanTaken(null);
        if (Object.keys(next).length) return;

        const body = {
            id: newId,
            name,
            isIndividualClient: true,
            pan,
            email: null,
            phone: values.phone.trim() || null,
            address: null,
            notes: null,
        };
        const result = await submit(() => createPerson(body));
        if (result.ok) {
            const created = result.data || {};
            onCreated({ type: 'PERSON', id: created.id || newId, name: created.name || name });
        } else if (result.error && result.error.code === 'PAN_TAKEN') {
            setPanTaken(result.error.message || 'A person with this PAN already exists');
        }
    };

    const onKeyDown = (e) => {
        if (e.key === 'Enter' && e.target.tagName === 'INPUT') {
            e.preventDefault();
            save();
        }
    };

    return (
        <div className="flex flex-col gap-4 pt-1" onKeyDown={onKeyDown}>
            <FormError message={panTaken ? null : formError} />
            <TextField
                label="Name"
                required
                autoFocus
                autoComplete="off"
                maxLength={PERSON_LIMITS.name}
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
            <TextField
                label="Phone"
                type="tel"
                inputMode="tel"
                maxLength={PERSON_LIMITS.phone}
                value={values.phone}
                onChange={set('phone')}
                error={errors.phone || fieldErrors.phone}
            />
            <p className="text-sm text-ink-muted">Saved as an individual client. Add email and address later from their profile.</p>
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
