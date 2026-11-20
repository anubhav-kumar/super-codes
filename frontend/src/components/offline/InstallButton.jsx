import useInstallPrompt from '../../hooks/useInstallPrompt.js';

/** In-app "Install app" button. Hidden when not installable or already running standalone. */
export default function InstallButton({ className = '' }) {
    const { canInstall, promptInstall } = useInstallPrompt();
    if (!canInstall) return null;
    return (
        <button
            type="button"
            onClick={promptInstall}
            className={`inline-flex items-center gap-2 rounded-xl bg-white px-5 py-2.5 text-sm font-semibold text-slate-900 shadow-lg shadow-brand-500/20 transition hover:bg-slate-100 ${className}`}
        >
            <svg aria-hidden="true" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                <path d="M10 2a1 1 0 0 1 1 1v8.59l2.3-2.3a1 1 0 1 1 1.4 1.42l-4 4a1 1 0 0 1-1.4 0l-4-4a1 1 0 1 1 1.4-1.42L9 11.6V3a1 1 0 0 1 1-1Zm-6 14a1 1 0 0 1 1-1h10a1 1 0 1 1 0 2H5a1 1 0 0 1-1-1Z" />
            </svg>
            Install app
        </button>
    );
}
