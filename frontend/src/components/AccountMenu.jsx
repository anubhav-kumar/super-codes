import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import useAuth from '../hooks/useAuth.js';
import useInstallPrompt from '../hooks/useInstallPrompt.js';
import useRole from '../hooks/useRole.js';
import { useWorker } from '../hooks/useWorkers.js';
import ConfirmDialog from './ConfirmDialog.jsx';
import Menu from './Menu.jsx';
import Tag from './Tag.jsx';

/** Name of the linked Worker; mounted only while the menu is open. Nothing when it cannot be loaded. */
function LinkedWorker({ workerId }) {
    const worker = useWorker(workerId);
    const name = worker.data && worker.data.name;
    if (!name) return null;
    return <p className="mt-1 truncate text-xs text-ink-muted">Worker: {name}</p>;
}

function AccountHeader({ user, isAdmin, workerId }) {
    return (
        <div className="border-b border-line px-4 py-3">
            <p className="text-xs text-ink-muted">Signed in as</p>
            <div className="flex items-baseline gap-2">
                <p className="min-w-0 truncate text-sm font-medium text-ink">{user?.name || user?.email}</p>
                <Tag className="shrink-0">{isAdmin ? 'Admin' : 'Member'}</Tag>
            </div>
            {user?.name && <p className="truncate text-xs text-ink-muted">{user.email}</p>}
            {workerId && <LinkedWorker workerId={workerId} />}
        </div>
    );
}

/**
 * Top-bar account menu. Header: "Signed in as", name, email (the only place it appears), role tag
 * (Admin or Member) and the linked Worker. Items: Install app, Sign out.
 */
export default function AccountMenu() {
    const { signOut } = useAuth();
    const { user, isAdmin, workerId } = useRole();
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
                header={<AccountHeader user={user} isAdmin={isAdmin} workerId={workerId} />}
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
