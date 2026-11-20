import useServiceWorkerUpdate from '../../hooks/useServiceWorkerUpdate.js';

/** "A new version is available" toast. Reload activates the waiting service worker. */
export default function UpdatePrompt() {
    const { needRefresh, applyUpdate, dismissUpdate } = useServiceWorkerUpdate();
    if (!needRefresh) return null;
    return (
        <div
            role="status"
            className="fixed inset-x-4 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-50 mx-auto flex max-w-md items-center gap-3 rounded-card border border-line bg-surface px-4 py-3 shadow-xl md:bottom-6"
        >
            <p className="flex-1 text-sm text-ink">A new version is available.</p>
            <button
                type="button"
                onClick={dismissUpdate}
                className="min-h-9 rounded-control px-3 text-sm font-medium text-ink-muted hover:bg-page"
            >
                Later
            </button>
            <button
                type="button"
                onClick={applyUpdate}
                className="min-h-9 rounded-control bg-primary-600 px-3 text-sm font-semibold text-white hover:bg-primary-700"
            >
                Reload
            </button>
        </div>
    );
}
