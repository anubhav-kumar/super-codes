import EmptyState from '../EmptyState.jsx';

/** User management is online only: shown offline instead of any (stale) data. */
export default function UsersOfflineState({ onRetry }) {
    return (
        <EmptyState
            icon="offline"
            title="Users needs a connection"
            text="User management is not available offline."
            action={{ label: 'Try again', onClick: onRetry }}
        />
    );
}
