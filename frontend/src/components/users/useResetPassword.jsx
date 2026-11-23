import { useState } from 'react';
import { resetUserPassword } from '../../api/users.js';
import useSubmit from '../../hooks/useSubmit.js';
import useToast from '../../hooks/useToast.js';
import ConfirmDialog from '../ConfirmDialog.jsx';
import TemporaryPasswordSheet, { firstName } from './TemporaryPasswordSheet.jsx';

/**
 * Reset password on User detail (F-51, online only): a confirmation, then
 * POST /auth/users/{id}/reset-password, then the temporary password once in a Sheet, and a reload so
 * the status shows "Must set new password". The password lives only in this hook's state and is
 * dropped when the sheet closes. Never offered on the admin's own record (the page hides it).
 *
 *   const reset = useResetPassword(user, reload);   user may be undefined while loading
 *   <Button onClick={reset.ask} disabled={reset.submitting}>Reset password</Button> {reset.dialog} {reset.sheet}
 */
export default function useResetPassword(user, reload) {
    const toast = useToast();
    const { submit, submitting } = useSubmit();
    const [confirming, setConfirming] = useState(false);
    const [issued, setIssued] = useState(null); // { password, expiresAt } while the sheet is open

    const id = user ? user.id : null;
    const name = user ? user.name : '';
    const first = name ? firstName(name) : null;
    const who = first || 'this user';

    const run = async () => {
        const result = await submit(() => resetUserPassword(id));
        setConfirming(false);
        if (!result.ok) {
            const error = result.error;
            if (!error || error.offline) toast.error('No connection. The password was not reset.');
            else toast.error(error.message || "Couldn't reset the password");
            if (error && error.status === 404 && reload) reload();
            return;
        }
        const data = result.data || {};
        if (data.temporaryPassword) {
            setIssued({ password: data.temporaryPassword, expiresAt: data.temporaryPasswordExpiresAt });
        }
        if (reload) reload();
    };

    const dialog = (
        <ConfirmDialog
            open={confirming}
            title={first ? `Reset ${first}'s password?` : 'Reset this password?'}
            text={`${first ? `${first} is` : 'They are'} signed out everywhere. You get a temporary password to give them. It works for 2 hours.`}
            confirmLabel="Reset password"
            busy={submitting}
            onConfirm={run}
            onCancel={() => setConfirming(false)}
        />
    );

    const sheet = (
        <TemporaryPasswordSheet
            open={issued !== null}
            name={name || who}
            password={issued ? issued.password : null}
            expiresAt={issued ? issued.expiresAt : null}
            onClose={() => setIssued(null)}
        />
    );

    return { ask: () => id && setConfirming(true), submitting, dialog, sheet };
}
