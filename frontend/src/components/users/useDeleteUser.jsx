import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { deleteUser } from '../../api/users.js';
import useSubmit from '../../hooks/useSubmit.js';
import useToast from '../../hooks/useToast.js';
import ConfirmDialog from '../ConfirmDialog.jsx';
import { firstName } from './TemporaryPasswordSheet.jsx';

// 409 codes from DELETE /auth/users/{id}, in the words of the frontend plan.
const ERROR_TEXT = {
    LAST_ADMIN: "You can't delete the last admin.",
    CANNOT_DELETE_SELF: "You can't delete your own account.",
};

/**
 * Delete user on User detail (F-53, online only): a danger confirmation, then DELETE /auth/users/{id}.
 * Success: toast "Asha deleted" and replace-navigate to /users (Back never returns to the deleted
 * record). Never offered on the admin's own record (the page hides it).
 *
 *   const del = useDeleteUser(user, reload);   user may be undefined while loading
 *   more={[{ label: 'Delete user', tone: 'danger', onSelect: del.ask }]} … {del.dialog}
 */
export default function useDeleteUser(user, reload) {
    const toast = useToast();
    const navigate = useNavigate();
    const { submit, submitting } = useSubmit();
    const [confirming, setConfirming] = useState(false);

    const id = user ? user.id : null;
    const first = user && user.name ? firstName(user.name) : null;

    const run = async () => {
        const result = await submit(() => deleteUser(id));
        setConfirming(false);
        if (!result.ok) {
            const error = result.error;
            if (!error || error.offline) toast.error('No connection. The user was not deleted.');
            else toast.error(ERROR_TEXT[error.code] || error.message || "Couldn't delete the user");
            // Already gone (deleted elsewhere): the reload shows "User not found".
            if (error && error.status === 404 && reload) reload();
            return;
        }
        toast.success(`${first || 'User'} deleted`);
        navigate('/users', { replace: true });
    };

    const who = first || 'This user';
    const keeps = user && user.worker ? ' Their worker record and order history stay.' : '';
    const dialog = (
        <ConfirmDialog
            open={confirming}
            title={first ? `Delete ${first}'s login?` : 'Delete this login?'}
            text={`${who} can't sign in any more and is signed out everywhere.${keeps}`}
            confirmLabel="Delete user"
            cancelLabel="Keep user"
            tone="danger"
            busy={submitting}
            onConfirm={run}
            onCancel={() => setConfirming(false)}
        />
    );

    return { ask: () => id && setConfirming(true), submitting, dialog };
}
