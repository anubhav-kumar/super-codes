import { useMemo } from 'react';
import SelectField from '../SelectField.jsx';

/** Choice values besides a Worker id. */
export const WORKER_NONE = 'none';
export const WORKER_NEW = 'new';

/**
 * Active Workers that no user is linked to, sorted by name (FR1 D4). The backend still validates.
 *   workers   GET /workers items (every status)
 *   users     GET /auth/users items
 *   keepId    a Worker id that stays available (the user's own current Worker on edit)
 */
export function linkableWorkers(workers, users, keepId = null) {
    const linked = new Set((users || []).map((u) => u.worker && u.worker.id).filter(Boolean));
    return (workers || [])
        .filter((w) => w.id === keepId || (w.status === 'ACTIVE' && !linked.has(w.id)))
        .slice()
        .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' }));
}

/**
 * Worker link of a user (Add user F-49, Edit user F-52): "No worker", "New worker named {name}", then
 * the linkable Workers. `value` is WORKER_NONE, WORKER_NEW or a Worker id; onChange receives it.
 *   name        the Name field, so the "New worker" label follows it
 *   workers     linkable Workers (linkableWorkers)
 *   currentId   marks that Worker "(current)" (edit)
 *   loading     Workers are still loading (only the first two options are offered meanwhile)
 */
export default function WorkerLinkField({ value, onChange, name, workers = [], currentId = null, loading = false, error }) {
    const options = useMemo(() => {
        const trimmed = String(name || '').trim();
        return [
            { value: WORKER_NONE, label: 'No worker' },
            { value: WORKER_NEW, label: trimmed ? `New worker named ${trimmed}` : 'New worker with this name' },
            ...workers.map((w) => ({ value: w.id, label: w.id === currentId ? `${w.name} (current)` : w.name })),
        ];
    }, [name, workers, currentId]);

    return (
        <SelectField
            label="Worker"
            options={options}
            value={value}
            onChange={onChange}
            error={error}
            hint={loading ? 'Loading workers…' : 'Orders assigned to this worker are the ones a member sees.'}
        />
    );
}
