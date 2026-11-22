import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import useAuth from '../hooks/useAuth.js';
import useInstallPrompt from '../hooks/useInstallPrompt.js';
import ConfirmDialog from './ConfirmDialog.jsx';
import Menu from './Menu.jsx';

/** Top-bar account menu: "Signed in as" + email (the only place it appears), Install app, Sign out. */
export default function AccountMenu() {
    const { user, signOut } = useAuth();
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
                header={
                    <div className="border-b border-line px-4 py-3">
                        <p className="text-xs text-ink-muted">Signed in as</p>
                        <p className="truncate text-sm font-medium text-ink">{user?.email}</p>
                    </div>
                }
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
