import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import useAuth from '../hooks/useAuth.js';
import useInstallPrompt from '../hooks/useInstallPrompt.js';
import useRole from '../hooks/useRole.js';
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
 * (Admin or Member) and the linked Worker. Items: Install app, Sign out.
 */
export default function AccountMenu() {
    const { signOut } = useAuth();
    const { user, isAdmin, workerName } = useRole();
    const { canInstall, promptInstall } = useInstallPrompt();
    const navigate = useNavigate();
    const [confirming, setConfirming] = useState(false);
    const [busy, setBusy] = useState(false);

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
                    canInstall && { label: 'Install app', icon: 'install', onSelect: promptInstall },
                    { label: 'Sign out', icon: 'sign-out', tone: 'danger', onSelect: () => setConfirming(true) },
                ]}
            />
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
