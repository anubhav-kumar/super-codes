/** Skeleton rows for the loading state; `fullScreen` centers a spinner (Suspense fallback). */
export default function PageLoader({ rows = 4, fullScreen = false }) {
    if (fullScreen) {
        return (
            <div role="status" className="flex h-full min-h-40 items-center justify-center">
                <span className="h-8 w-8 animate-spin rounded-full border-3 border-ink border-r-transparent" />
                <span className="sr-only">Loading</span>
            </div>
        );
    }
    return (
        <div role="status" className="flex flex-col gap-3" aria-label="Loading">
            {Array.from({ length: rows }, (_, i) => (
                <div key={i} className="flex animate-pulse flex-col gap-2 rounded-card border border-line bg-surface p-4">
                    <div className="h-4 w-1/2 rounded bg-surface-muted" />
                    <div className="h-3 w-1/3 rounded bg-surface-muted" />
                </div>
            ))}
            <span className="sr-only">Loading</span>
        </div>
    );
}
