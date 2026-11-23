import { useEffect, useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { setNewPassword } from '../api/auth.js';
import AppMark from '../components/AppMark.jsx';
import Button from '../components/Button.jsx';
import FormError from '../components/FormError.jsx';
import Icon from '../components/Icon.jsx';
import PasswordField from '../components/PasswordField.jsx';
import useAuth from '../hooks/useAuth.js';
import useOnlineStatus from '../hooks/useOnlineStatus.js';
import useSubmit from '../hooks/useSubmit.js';
import useToast from '../hooks/useToast.js';
import { forgetTemporaryPassword, heldTemporaryPassword } from '../utils/temporaryPassword.js';

const MIN_LENGTH = 8;
const NO_CONNECTION = 'No connection. Your password was not changed.';
const EXPIRED_MESSAGE = 'Your temporary password has expired. Ask an admin to reset it.';
const WRONG_TEMPORARY = "That's not your temporary password";
const SAME_AS_TEMPORARY = 'Choose a password different from the temporary one';
// As built (P-24 F-47): the server's messages for these two cases.
const SERVER_WRONG_CURRENT = 'Current password is incorrect';
const SERVER_SAME_PASSWORD = 'New password must be different from the current password';

/** Only same-app paths, never the sign-in or this page itself. */
function safeNext(next) {
    if (
        !next ||
        !next.startsWith('/') ||
        next.startsWith('//') ||
        next.startsWith('/sign-in') ||
        next.startsWith('/set-password')
    ) {
        return '/';
    }
    return next;
}

const sessionExpired = (session) => {
    const at = session && session.expiresAt ? Date.parse(session.expiresAt) : NaN;
    return Number.isFinite(at) && at <= Date.now();
};

function validate({ temporaryPassword, newPassword, confirmPassword }, askTemporary) {
    const errors = {};
    if (askTemporary && !temporaryPassword) errors.temporaryPassword = 'Enter your temporary password';
    if (newPassword.length < MIN_LENGTH) errors.newPassword = 'Use at least 8 characters';
    if (!errors.newPassword && confirmPassword !== newPassword) errors.confirmPassword = "Passwords don't match";
    return errors;
}

/**
 * Set a new password (F-50). Public route without the app shell: RequireAuth sends a session with
 * mustChangePassword here, and the page checks the session itself (no session -> Sign in; no
 * temporary password to replace -> `next`).
 *
 * POST /auth/password { currentPassword: <temporary>, newPassword }. The temporary password comes
 * from Sign in in memory; after a reload it is asked for again. The session's expiresAt is the
 * temporary password's expiry, and a 401 means it expired (or the session ended): the form is then
 * replaced by the expired message and Sign out.
 */
export default function SetPasswordPage() {
    const { session, user, updateSession, signOut } = useAuth();
    const { online } = useOnlineStatus();
    const toast = useToast();
    const navigate = useNavigate();
    const [params] = useSearchParams();
    const next = safeNext(params.get('next'));

    const [heldPassword] = useState(heldTemporaryPassword);
    const [askTemporary, setAskTemporary] = useState(() => !heldPassword);
    const [values, setValues] = useState({ temporaryPassword: '', newPassword: '', confirmPassword: '' });
    const [localErrors, setLocalErrors] = useState({});
    const [expired, setExpired] = useState(() => sessionExpired(session));
    const [signingOut, setSigningOut] = useState(false);
    const { submit, submitting, formError, fieldErrors, setFormError, setFieldErrors } = useSubmit();

    // The handed-over temporary password lives only as long as this screen.
    useEffect(() => () => forgetTemporaryPassword(), []);

    if (!session) return <Navigate to="/sign-in" replace />;
    if (!user || user.mustChangePassword !== true) return <Navigate to={next} replace />;

    const set = (field) => (v) => {
        setValues((s) => ({ ...s, [field]: v }));
        if (localErrors[field]) setLocalErrors((e) => ({ ...e, [field]: undefined }));
        if (fieldErrors[field]) setFieldErrors((e) => ({ ...e, [field]: undefined }));
    };

    const handleSignOut = async () => {
        setSigningOut(true);
        forgetTemporaryPassword();
        await signOut();
        navigate('/sign-in', { replace: true });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        const errors = validate(values, askTemporary);
        setLocalErrors(errors);
        if (Object.keys(errors).length > 0) return;
        if (sessionExpired(session)) {
            setExpired(true);
            return;
        }
        const temporaryPassword = askTemporary ? values.temporaryPassword : heldPassword;
        const result = await submit(() => setNewPassword({ temporaryPassword, newPassword: values.newPassword }));
        if (!result.ok) {
            const error = result.error;
            if (!error || error.offline) {
                setFormError(NO_CONNECTION);
            } else if (error.status === 401) {
                forgetTemporaryPassword();
                setExpired(true);
            } else if (error.details && error.details.some((d) => d && d.field === 'currentPassword') && !askTemporary) {
                // The handed-over password was not accepted: ask for it.
                setAskTemporary(true);
            }
            return;
        }
        forgetTemporaryPassword();
        const data = result.data || {};
        const patch = {};
        if (data.user) patch.user = data.user;
        if (data.expiresAt) patch.expiresAt = data.expiresAt;
        // The answer carries the user (mustChangePassword false); the fallback keeps the gate from sending the user back.
        if (!patch.user) patch.user = { ...user, mustChangePassword: false };
        await updateSession(patch);
        toast.success('Password set');
        navigate(next, { replace: true });
    };

    const serverCurrent = fieldErrors.currentPassword;
    const temporaryError =
        localErrors.temporaryPassword || (serverCurrent === SERVER_WRONG_CURRENT ? WRONG_TEMPORARY : serverCurrent);
    const serverNew = fieldErrors.newPassword;
    const newError = localErrors.newPassword || (serverNew === SERVER_SAME_PASSWORD ? SAME_AS_TEMPORARY : serverNew);
    const hasFieldError = Boolean(fieldErrors.currentPassword || fieldErrors.newPassword);
    const banner = formError && !hasFieldError ? formError : null;

    return (
        <main className="flex h-full overflow-y-auto">
            <div className="m-auto w-full max-w-sm px-4 py-10">
                <div className="mb-8 text-center">
                    <AppMark size={40} className="mb-4" />
                    <h1 className="text-2xl font-semibold text-ink">Set a new password</h1>
                    <p className="mt-1 text-sm text-ink-muted">
                        You signed in with a temporary password. Choose your own to continue.
                    </p>
                </div>

                {expired ? (
                    <div className="flex flex-col gap-4 rounded-card border border-line bg-surface p-5">
                        <FormError message={EXPIRED_MESSAGE} />
                        <Button size="lg" loading={signingOut} onClick={handleSignOut} className="w-full">
                            Sign out
                        </Button>
                    </div>
                ) : (
                    <>
                        <form
                            noValidate
                            onSubmit={handleSubmit}
                            aria-busy={submitting || undefined}
                            className="flex flex-col gap-4 rounded-card border border-line bg-surface p-5"
                        >
                            {!online && (
                                <p
                                    role="status"
                                    className="flex items-start gap-2 rounded-control bg-surface-muted px-3 py-2.5 text-sm text-ink-muted"
                                >
                                    <Icon name="offline" size="sm" className="mt-0.5 shrink-0" />
                                    Setting a password needs a connection.
                                </p>
                            )}
                            <FormError message={banner} />

                            {/* Lets password managers tie the new password to this account. */}
                            <input type="text" autoComplete="username" value={user.email || ''} readOnly hidden />
                            {askTemporary && (
                                <PasswordField
                                    label="Temporary password"
                                    autoComplete="current-password"
                                    value={values.temporaryPassword}
                                    onChange={set('temporaryPassword')}
                                    error={temporaryError}
                                    hint="The password an admin gave you."
                                    autoFocus
                                />
                            )}
                            <PasswordField
                                label="New password"
                                autoComplete="new-password"
                                value={values.newPassword}
                                onChange={set('newPassword')}
                                error={newError}
                                hint="At least 8 characters."
                                autoFocus={!askTemporary}
                            />
                            <PasswordField
                                label="Confirm new password"
                                autoComplete="new-password"
                                value={values.confirmPassword}
                                onChange={set('confirmPassword')}
                                error={localErrors.confirmPassword}
                            />

                            <Button type="submit" size="lg" loading={submitting} disabled={!online} className="mt-1 w-full">
                                Save and continue
                            </Button>
                        </form>
                        <div className="mt-4 text-center">
                            <Button variant="ghost" loading={signingOut} disabled={submitting} onClick={handleSignOut}>
                                Sign out
                            </Button>
                        </div>
                    </>
                )}
            </div>
        </main>
    );
}
