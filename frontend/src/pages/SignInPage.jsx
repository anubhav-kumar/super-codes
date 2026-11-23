import { useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import Button from '../components/Button.jsx';
import AppMark from '../components/AppMark.jsx';
import FormError from '../components/FormError.jsx';
import Icon from '../components/Icon.jsx';
import TextField from '../components/TextField.jsx';
import { APP_NAME } from '../config.js';
import useAuth from '../hooks/useAuth.js';
import useOnlineStatus from '../hooks/useOnlineStatus.js';
import useSubmit from '../hooks/useSubmit.js';
import { holdTemporaryPassword } from '../utils/temporaryPassword.js';
import { isValidEmail } from '../utils/validation.js';

const SET_PASSWORD_PATH = '/set-password';
const TEMPORARY_EXPIRED_MESSAGE = 'Your temporary password has expired. Ask an admin to reset it.';

/** Only same-app paths are allowed as the post-sign-in destination. */
function safeNext(next) {
    if (
        !next ||
        !next.startsWith('/') ||
        next.startsWith('//') ||
        next.startsWith('/sign-in') ||
        next.startsWith(SET_PASSWORD_PATH)
    ) {
        return '/';
    }
    return next;
}

const mustSetPassword = (session) => Boolean(session && session.user && session.user.mustChangePassword === true);

/** A temporary password must be replaced before anything else (F-50). */
function afterSignIn(session, next) {
    return mustSetPassword(session) ? `${SET_PASSWORD_PATH}?next=${encodeURIComponent(next)}` : next;
}

function validate({ email, password }) {
    const errors = {};
    if (!email.trim()) errors.email = 'Enter your email';
    else if (!isValidEmail(email)) errors.email = 'Enter a valid email';
    if (!password) errors.password = 'Enter your password';
    return errors;
}

export default function SignInPage() {
    const { session, signIn } = useAuth();
    const { online } = useOnlineStatus();
    const navigate = useNavigate();
    const [params] = useSearchParams();
    const next = safeNext(params.get('next'));
    const expired = params.get('expired') === '1';

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [localErrors, setLocalErrors] = useState({});
    const { submit, submitting, formError, fieldErrors, setFormError } = useSubmit();

    if (session) return <Navigate to={afterSignIn(session, next)} replace />;

    const handleSubmit = async (e) => {
        e.preventDefault();
        const errors = validate({ email, password });
        setLocalErrors(errors);
        if (Object.keys(errors).length) return;
        const result = await submit(async () => {
            const signedIn = await signIn({ email: email.trim(), password });
            // Signed in with a temporary password: "Set a new password" sends it as the current
            // password, so it is handed over in memory only (before the next render reads it).
            if (mustSetPassword(signedIn)) holdTemporaryPassword(password);
            return signedIn;
        });
        if (result.ok) {
            navigate(afterSignIn(result.data, next), { replace: true });
            return;
        }
        if (result.error && result.error.code === 'TEMPORARY_PASSWORD_EXPIRED') setFormError(TEMPORARY_EXPIRED_MESSAGE);
    };

    // Field-level server errors show under the field; anything else (e.g. "Incorrect email or password") in the banner.
    const serverError = formError && !fieldErrors.email && !fieldErrors.password ? formError : null;

    return (
        <main className="flex h-full overflow-y-auto">
            <div className="m-auto w-full max-w-sm px-4 py-10">
                <div className="mb-8 text-center">
                    <AppMark size={40} className="mb-4" />
                    <h1 className="text-2xl font-semibold text-ink">{APP_NAME}</h1>
                    <p className="mt-1 text-sm text-ink-muted">Sign in to continue</p>
                </div>

                <form noValidate onSubmit={handleSubmit} className="flex flex-col gap-4 rounded-card border border-line bg-surface p-5">
                    {expired && !formError && (
                        <p role="status" className="rounded-control bg-surface-muted px-3 py-2.5 text-sm text-ink-muted">
                            Your session has ended. Sign in again.
                        </p>
                    )}
                    {!online && (
                        <p role="status" className="flex items-start gap-2 rounded-control bg-surface-muted px-3 py-2.5 text-sm text-ink-muted">
                            <Icon name="offline" size="sm" className="mt-0.5 shrink-0" />
                            Sign in needs a connection. Connect and try again.
                        </p>
                    )}
                    <FormError message={serverError} />

                    <TextField
                        label="Email"
                        type="email"
                        inputMode="email"
                        autoComplete="username"
                        autoCapitalize="none"
                        spellCheck={false}
                        value={email}
                        onChange={(v) => {
                            setEmail(v);
                            if (localErrors.email) setLocalErrors((er) => ({ ...er, email: undefined }));
                        }}
                        error={localErrors.email || fieldErrors.email}
                    />
                    <TextField
                        label="Password"
                        type={showPassword ? 'text' : 'password'}
                        autoComplete="current-password"
                        value={password}
                        onChange={(v) => {
                            setPassword(v);
                            if (localErrors.password) setLocalErrors((er) => ({ ...er, password: undefined }));
                        }}
                        error={localErrors.password || fieldErrors.password}
                        trailing={
                            <button
                                type="button"
                                onClick={() => setShowPassword((s) => !s)}
                                aria-label={showPassword ? 'Hide password' : 'Show password'}
                                aria-pressed={showPassword}
                                className="flex h-10 w-10 items-center justify-center rounded-control text-ink-muted hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-accent"
                            >
                                <Icon name={showPassword ? 'eye-off' : 'eye'} />
                            </button>
                        }
                    />

                    <Button type="submit" size="lg" loading={submitting} disabled={!online} className="mt-1 w-full">
                        Sign in
                    </Button>
                </form>
            </div>
        </main>
    );
}
