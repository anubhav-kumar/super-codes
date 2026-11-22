import { useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import Button from '../components/Button.jsx';
import FormError from '../components/FormError.jsx';
import Icon from '../components/Icon.jsx';
import TextField from '../components/TextField.jsx';
import { APP_NAME } from '../config.js';
import useAuth from '../hooks/useAuth.js';
import useOnlineStatus from '../hooks/useOnlineStatus.js';
import useSubmit from '../hooks/useSubmit.js';
import { isValidEmail } from '../utils/validation.js';

/** Only same-app paths are allowed as the post-sign-in destination. */
function safeNext(next) {
    if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/sign-in')) return '/';
    return next;
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
    const { submit, submitting, formError, fieldErrors } = useSubmit();

    if (session) return <Navigate to={next} replace />;

    const handleSubmit = async (e) => {
        e.preventDefault();
        const errors = validate({ email, password });
        setLocalErrors(errors);
        if (Object.keys(errors).length) return;
        const result = await submit(() => signIn({ email: email.trim(), password }));
        if (result.ok) navigate(next, { replace: true });
    };

    // Field-level server errors show under the field; anything else (e.g. "Incorrect email or password") in the banner.
    const serverError = formError && !fieldErrors.email && !fieldErrors.password ? formError : null;

    return (
        <main className="flex h-full overflow-y-auto">
            <div className="m-auto w-full max-w-sm px-4 py-10">
                <div className="mb-8 text-center">
                    <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-card bg-accent text-on-accent">
                        <Icon name="invoices" className="h-6 w-6" />
                    </span>
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
                            <Icon name="offline" className="mt-0.5 h-4 w-4 shrink-0" />
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
                                <Icon name={showPassword ? 'eye-off' : 'eye'} className="h-5 w-5" />
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
