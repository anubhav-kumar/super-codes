import Badge from '../Badge.jsx';
import ClientIcon from '../ClientIcon.jsx';
import ListRow from '../ListRow.jsx';
import { designationLabel, WORKER_STATUS_TONE, workerStatusLabel } from '../../constants/workers.js';
import { Missing } from './directoryText.jsx';

/** "3 open" workload count; quiet when the worker has no open orders. */
export function OpenOrders({ worker, compact = false }) {
    const n = worker.openOrderCount || 0;
    return (
        <span className={`whitespace-nowrap tabular-nums ${n > 0 ? 'font-medium text-ink' : 'text-ink-subtle'}`}>
            {compact ? n : `${n} open`}
        </span>
    );
}

/** Worker status badge, or nothing when the list filter already implies it (`hideActive`). */
export function WorkerStatus({ worker, hideActive = false }) {
    if (hideActive && worker.status === 'ACTIVE') return null;
    return <Badge tone={WORKER_STATUS_TONE[worker.status]}>{workerStatusLabel(worker.status)}</Badge>;
}

/**
 * Workers list row (F-30). Leading person icon like People rows (F-42). Line 1: name + "N open" on the right. Line 2: designation · status badge
 * (no Active badge in the Active filter; Inactive is a quiet gray badge).
 */
export default function WorkerRow({ worker, hideActive = false }) {
    return (
        <ListRow
            to={`/workers/${worker.id}`}
            leading={<ClientIcon type="PERSON" />}
            title={worker.name}
            trailing={<OpenOrders worker={worker} />}
            meta={[
                designationLabel(worker.designation) || <Missing key="designation">No designation</Missing>,
                <WorkerStatus key="status" worker={worker} hideActive={hideActive} />,
            ]}
        />
    );
}
