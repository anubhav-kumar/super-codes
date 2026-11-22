import useServiceWorkerUpdate from '../../hooks/useServiceWorkerUpdate.js';

/** "A new version is available" toast. Reload activates the waiting service worker. */
export default function UpdatePrompt() {
    const { needRefresh, applyUpdate, dismissUpdate } = useServiceWorkerUpdate();
    if (!needRefresh) return null;
    return (
        <div
            role="status"
            className="fixed inset-x-4 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-50 mx-auto flex max-w-md items-center gap-3 rounded-card bg-ink px-4 py-3 text-white shadow-overlay md:bottom-6"
        >
            <p className="flex-1 text-sm">A new version is available.</p>
            <button
                type="button"
                onClick={dismissUpdate}
                className="min-h-9 rounded-control px-3 text-sm font-medium text-white/80 hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-white"
            >
                Later
            </button>
            <button
                type="button"
                onClick={applyUpdate}
                className="min-h-9 rounded-control bg-white px-3 text-sm font-semibold text-ink hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
                Reload
            </button>
        </div>
    );
}
