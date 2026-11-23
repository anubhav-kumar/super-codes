import { Link } from 'react-router-dom';
import { UserName, UserStatus } from './UserRow.jsx';
import { roleLabel, workerName } from './userStatus.js';

const dash = <span className="text-ink-subtle">—</span>;

/**
 * DataTable columns of the Users list at lg+ (F-48): Name (+ You) · Email · Role · Worker · Status.
 * Worker links to the Worker and hides under 50rem. `meId` is the signed-in user's id.
 */
export function userColumns({ meId }) {
    return [
        { key: 'name', header: 'Name', sortKey: 'name', minWidth: '12rem', render: (u) => <UserName user={u} isYou={u.id === meId} /> },
        { key: 'email', header: 'Email', render: (u) => <span className="break-all">{u.email}</span> },
        { key: 'role', header: 'Role', nowrap: true, render: (u) => <span className="text-ink-muted">{roleLabel(u)}</span> },
        {
            key: 'worker',
            header: 'Worker',
            hideNarrow: true,
            render: (u) =>
                u.worker ? (
                    <Link to={`/workers/${u.worker.id}`} className="relative z-10 underline-offset-2 hover:underline focus-visible:underline">
                        {workerName(u)}
                    </Link>
                ) : (
                    dash
                ),
        },
        { key: 'status', header: 'Status', nowrap: true, render: (u) => <UserStatus user={u} /> },
    ];
}
