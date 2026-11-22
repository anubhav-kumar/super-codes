import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import useAuth from '../hooks/useAuth.js';
import ConfirmDialog from './ConfirmDialog.jsx';
import Icon from './Icon.jsx';
import InstallButton from './offline/InstallButton.jsx';

/** Header account menu: signed-in email, Install app (when installable), Sign out. */
export default function AccountMenu() {
    const { user, signOut } = useAuth();
    const navigate = useNavigate();
    const [open, setOpen] = useState(false);
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
        <div className="relative">
            <button
                type="button"
                onClick={() => setOpen((o) => !o)}
                aria-haspopup="menu"
                aria-expanded={open}
                aria-label="Account"
                className="flex h-11 w-11 items-center justify-center rounded-full text-ink hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-accent"
            >
                <Icon name="user" />
            </button>
            {open && (
                <>
                    <button
                        type="button"
                        aria-label="Close menu"
                        tabIndex={-1}
                        onClick={() => setOpen(false)}
                        className="fixed inset-0 z-40 cursor-default"
                    />
                    <div role="menu" className="absolute top-12 right-0 z-50 w-64 overflow-hidden rounded-card border border-line bg-surface py-1 shadow-overlay">
                        <div className="border-b border-line px-4 py-3">
                            <p className="text-xs text-ink-muted">Signed in as</p>
                            <p className="truncate text-sm font-medium text-ink">{user?.email}</p>
                        </div>
                        <InstallButton variant="menu" onInstalled={() => setOpen(false)} />
                        <button
                            type="button"
                            role="menuitem"
                            onClick={() => {
                                setOpen(false);
                                setConfirming(true);
                            }}
                            className="flex min-h-11 w-full items-center gap-3 px-4 text-left text-sm text-danger hover:bg-danger-bg focus-visible:bg-danger-bg focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
                        >
                            <Icon name="sign-out" className="h-4 w-4" />
                            Sign out
                        </button>
                    </div>
                </>
            )}
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
        </div>
    );
}
