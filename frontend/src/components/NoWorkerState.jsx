import EmptyState from './EmptyState.jsx';

/**
 * Empty state for a member whose login is not linked to a Worker (FR1 D4). Shown instead of a
 * list's own empty state: the backend returns nothing for such a member.
 */
export default function NoWorkerState({ className = '' }) {
    return (
        <EmptyState
            icon="unlinked"
            title="You're not linked to a worker yet"
            text="Ask an admin to link your login to your worker record. Your orders, clients and invoices will then show here."
            className={className}
        />
    );
}
