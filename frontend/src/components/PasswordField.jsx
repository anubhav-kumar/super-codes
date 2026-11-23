import { useState } from 'react';
import Icon from './Icon.jsx';
import TextField from './TextField.jsx';

/**
 * Password input with a show/hide eye button (the Sign in pattern).
 *   <PasswordField label="New password" autoComplete="new-password" value={v} onChange={setV} hint="At least 8 characters." />
 * `autoComplete` is 'current-password' or 'new-password' so password managers fill and save correctly.
 * Other props go to TextField (error, hint, autoFocus, required, …).
 */
export default function PasswordField({ autoComplete = 'current-password', ...rest }) {
    const [shown, setShown] = useState(false);
    return (
        <TextField
            {...rest}
            type={shown ? 'text' : 'password'}
            autoComplete={autoComplete}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            trailing={
                <button
                    type="button"
                    onClick={() => setShown((s) => !s)}
                    aria-label={shown ? 'Hide password' : 'Show password'}
                    aria-pressed={shown}
                    className="flex h-10 w-10 items-center justify-center rounded-control text-ink-muted hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-accent"
                >
                    <Icon name={shown ? 'eye-off' : 'eye'} />
                </button>
            }
        />
    );
}
