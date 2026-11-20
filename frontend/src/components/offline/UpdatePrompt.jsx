import useServiceWorkerUpdate from '../../hooks/useServiceWorkerUpdate.js';

/** "A new version is available" toast. Reload activates the waiting service worker. */
export default function UpdatePrompt() {
    const { needRefresh, applyUpdate, dismissUpdate } = useServiceWorkerUpdate();
    if (!needRefresh) return null;
    return (
        <div className="fixed inset-x-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-50 mx-auto flex max-w-md items-center gap-3 rounded-2xl bg-slate-800 px-4 py-3 shadow-2xl ring-1 ring-white/10">
            <p className="flex-1 text-sm text-slate-100">A new version is available.</p>
            <button type="button" onClick={dismissUpdate} className="rounded-lg px-3 py-1.5 text-sm text-slate-300 hover:bg-white/5">
                Later
            </button>
            <button
                type="button"
                onClick={applyUpdate}
                className="rounded-lg bg-brand-500 px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-600"
            >
                Reload
            </button>
        </div>
    );
}
