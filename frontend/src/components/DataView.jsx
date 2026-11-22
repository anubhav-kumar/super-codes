import StaleDataNotice from './offline/StaleDataNotice.jsx';
import EmptyState from './EmptyState.jsx';
import PageSkeleton from './PageSkeleton.jsx';

/**
 * Renders the four data-screen states for a useResource() result:
 *   loading      -> PageSkeleton shaped like the screen (`skeleton`: list, rows, table, detail, form, home)
 *   loaded       -> children (a node, or a function of data)
 *   stale        -> StaleDataNotice above the children
 *   unavailable  -> "Not available offline" with Try again
 *   error        -> the error message with Try again
 * `compact` renders smaller states for a section inside a page.
 */
export default function DataView({ resource, children, compact = false, loaderRows, skeleton }) {
    const { status, data, fromCache, fetchedAt, error, reload } = resource;

    if (status === 'loading') {
        if (compact) return <PageSkeleton variant="rows" rows={loaderRows ?? 2} framed={false} />;
        if (!skeleton) return <PageSkeleton variant="rows" rows={loaderRows ?? 4} />;
        return <PageSkeleton variant={skeleton} rows={loaderRows} />;
    }

    if (status === 'unavailable') {
        return (
            <EmptyState
                icon="offline"
                compact={compact}
                title="Not available offline"
                text="Open this screen once while online to keep a copy on this device."
                action={{ label: 'Try again', onClick: reload }}
            />
        );
    }

    if (status === 'error') {
        const notFound = error && error.status === 404;
        return (
            <EmptyState
                icon="alert"
                compact={compact}
                title={notFound ? 'Not found' : "Couldn't load this"}
                text={notFound ? 'This record does not exist or was removed.' : (error && error.message) || 'Something went wrong.'}
                action={notFound ? { label: 'Go home', to: '/' } : { label: 'Try again', onClick: reload }}
            />
        );
    }

    return (
        <>
            {fromCache && <StaleDataNotice fetchedAt={fetchedAt} className={compact ? 'mb-2' : 'mb-4'} />}
            {typeof children === 'function' ? children(data) : children}
        </>
    );
}
