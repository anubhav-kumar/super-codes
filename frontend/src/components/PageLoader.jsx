import PageSkeleton from './PageSkeleton.jsx';

/**
 * Old loading API kept for existing callers. `fullScreen` centers a spinner in ink (app-level
 * Suspense fallback, before the shell exists); otherwise it renders PageSkeleton (`variant`, or
 * `rows` two-line rows when only a row count is given).
 */
export default function PageLoader({ rows, variant, fullScreen = false }) {
    if (fullScreen) {
        return (
            <div role="status" className="flex h-full min-h-40 items-center justify-center">
                <span className="h-8 w-8 animate-spin rounded-full border-3 border-ink border-r-transparent" />
                <span className="sr-only">Loading</span>
            </div>
        );
    }
    if (variant) return <PageSkeleton variant={variant} rows={rows} />;
    return <PageSkeleton variant="rows" rows={rows ?? 4} />;
}
