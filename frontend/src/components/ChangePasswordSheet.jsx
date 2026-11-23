import { useId, useState } from 'react';
import { changePassword } from '../api/auth.js';
import useAuth from '../hooks/useAuth.js';
import useSubmit from '../hooks/useSubmit.js';
import useToast from '../hooks/useToast.js';
import Button from './Button.jsx';
import FormError from './FormError.jsx';
import PasswordField from './PasswordField.jsx';
import Sheet from './Sheet.jsx';

const MIN_LENGTH = 8;
const NO_CONNECTION = 'No connection. Your password was not changed.';
const WRONG_CURRENT = "That's not your current password";

function validate({ currentPassword, newPassword, confirmPassword }) {
    const errors = {};
    if (!currentPassword) errors.currentPassword = 'Enter your current password';
    if (newPassword.length < MIN_LENGTH) errors.newPassword = 'Use at least 8 characters';
    if (!errors.newPassword && confirmPassword !== newPassword) errors.confirmPassword = "Passwords don't match";
    return errors;
}

// The form lives only while the sheet is open, so the typed passwords are dropped on close.
function ChangePasswordForm({ formId, onDone, setSubmitting }) {
    const { user, updateSession } = useAuth();
    const toast = useToast();
    const { submit, submitting, formError, fieldErrors, setFormError, setFieldErrors } = useSubmit();
    const [values, setValues] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
    const [localErrors, setLocalErrors] = useState({});

    const set = (field) => (v) => {
        setValues((s) => ({ ...s, [field]: v }));
        if (localErrors[field]) setLocalErrors((e) => ({ ...e, [field]: undefined }));
        if (fieldErrors[field]) setFieldErrors((e) => ({ ...e, [field]: undefined }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        const errors = validate(values);
        setLocalErrors(errors);
        if (Object.keys(errors).length > 0) return;
        setSubmitting(true);
        const result = await submit(() =>
            changePassword({ currentPassword: values.currentPassword, newPassword: values.newPassword })
        );
        setSubmitting(false);
        if (!result.ok) {
            // Offline before or during the save: say plainly that nothing changed.
            if (!result.error || result.error.offline) setFormError(NO_CONNECTION);
            return;
        }
        // 200 { user, expiresAt }: this session stays, with a new expiry; other sessions are ended.
        const data = result.data || {};
        const patch = {};
        if (data.user) patch.user = data.user;
        if (data.expiresAt) patch.expiresAt = data.expiresAt;
        if (data.token) patch.token = data.token;
        if (Object.keys(patch).length > 0) await updateSession(patch);
        toast.success("Password changed. You're signed out on other devices.");
        onDone();
    };

    const serverCurrent = fieldErrors.currentPassword;
    const currentError =
        localErrors.currentPassword ||
        (serverCurrent === 'Current password is incorrect' ? WRONG_CURRENT : serverCurrent);
    const newError = localErrors.newPassword || fieldErrors.newPassword;
    const hasFieldError = Boolean(fieldErrors.currentPassword || fieldErrors.newPassword);
    const banner = formError && !hasFieldError ? formError : null;

    return (
        <form id={formId} noValidate onSubmit={handleSubmit} aria-busy={submitting || undefined} className="flex flex-col gap-4 pt-1">
            <FormError message={banner} />
            <PasswordField
                label="Current password"
                autoComplete="current-password"
                value={values.currentPassword}
                onChange={set('currentPassword')}
                error={currentError}
            />
            <PasswordField
                label="New password"
                autoComplete="new-password"
                value={values.newPassword}
                onChange={set('newPassword')}
                error={newError}
                hint="At least 8 characters."
            />
            <PasswordField
                label="Confirm new password"
                autoComplete="new-password"
                value={values.confirmPassword}
                onChange={set('confirmPassword')}
                error={localErrors.confirmPassword}
            />
            {/* Lets password managers tie the new password to this account. Last, so the sheet focuses Current password. */}
            <input type="text" autoComplete="username" value={user?.email || ''} readOnly hidden />
        </form>
    );
}

/**
 * Change own password (F-47), opened from the account menu. Online only.
 * POST /auth/password { currentPassword, newPassword }. A wrong current password is a 400 with a
 * field error (not a 401), so it shows under the field and the user stays signed in.
 */
export default function ChangePasswordSheet({ open, onClose }) {
    const formId = useId();
    const [submitting, setSubmitting] = useState(false);

    const close = () => {
        if (submitting) return;
        onClose();
    };

    return (
        <Sheet
            open={open}
            title="Change password"
            onClose={close}
            footer={
                <>
                    <Button variant="secondary" onClick={close} disabled={submitting}>
                        Cancel
                    </Button>
                    <Button type="submit" form={formId} loading={submitting}>
                        Change password
                    </Button>
                </>
            }
        >
            {open && (
                <ChangePasswordForm
                    formId={formId}
                    setSubmitting={setSubmitting}
                    onDone={() => {
                        setSubmitting(false);
                        onClose();
                    }}
                />
            )}
        </Sheet>
    );
}
