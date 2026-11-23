import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import useAuth from '../hooks/useAuth.js';
import useInstallPrompt from '../hooks/useInstallPrompt.js';
import useOnlineStatus from '../hooks/useOnlineStatus.js';
import useRole from '../hooks/useRole.js';
import ChangePasswordSheet from './ChangePasswordSheet.jsx';
import ConfirmDialog from './ConfirmDialog.jsx';
import Menu from './Menu.jsx';
import Tag from './Tag.jsx';

function AccountHeader({ user, isAdmin, workerName }) {
    return (
        <div className="border-b border-line px-4 py-3">
            <p className="text-xs text-ink-muted">Signed in as</p>
            <div className="flex items-baseline gap-2">
                <p className="min-w-0 truncate text-sm font-medium text-ink">{user?.name || user?.email}</p>
                <Tag className="shrink-0">{isAdmin ? 'Admin' : 'Member'}</Tag>
            </div>
            {user?.name && <p className="truncate text-xs text-ink-muted">{user.email}</p>}
            {workerName && <p className="mt-1 truncate text-xs text-ink-muted">Worker: {workerName}</p>}
        </div>
    );
}

/**
 * Top-bar account menu. Header: "Signed in as", name, email (the only place it appears), role tag
 * (Admin or Member) and the linked Worker. Items: Users (admins only, F-48; the phone way to reach
 * Users, which is sidebar only), Change password (F-47, needs a connection), Install app, Sign out.
 */
export default function AccountMenu() {
    const { signOut } = useAuth();
    const { user, isAdmin, workerName } = useRole();
    const { canInstall, promptInstall } = useInstallPrompt();
    const { online } = useOnlineStatus();
    const navigate = useNavigate();
    const [confirming, setConfirming] = useState(false);
    const [busy, setBusy] = useState(false);
    const [changingPassword, setChangingPassword] = useState(false);

    const handleSignOut = async () => {
        setBusy(true);
        try {
            await signOut();
        } finally {
            setBusy(false);
            setConfirming(false);
            navigate('/sign-in', { replace: true });
        }
    };

    return (
        <>
            <Menu
                label="Account"
                icon="account"
                header={<AccountHeader user={user} isAdmin={isAdmin} workerName={workerName} />}
                items={[
                    isAdmin && { label: 'Users', icon: 'users', to: '/users' },
                    {
                        label: 'Change password',
                        icon: 'key',
                        disabled: !online,
                        hint: online ? undefined : 'Needs a connection',
                        onSelect: () => setChangingPassword(true),
                    },
                    canInstall && { label: 'Install app', icon: 'install', onSelect: promptInstall },
                    { label: 'Sign out', icon: 'sign-out', tone: 'danger', onSelect: () => setConfirming(true) },
                ]}
            />
            <ChangePasswordSheet open={changingPassword} onClose={() => setChangingPassword(false)} />
            <ConfirmDialog
                open={confirming}
                title="Sign out?"
                text="Saved client data on this device will be removed."
                confirmLabel="Sign out"
                tone="danger"
                busy={busy}
                onConfirm={handleSignOut}
                onCancel={() => setConfirming(false)}
            />
        </>
    );
}
