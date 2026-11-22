import { designationLabel } from '../../constants/workers.js';
import { OpenOrders, WorkerStatus } from './WorkerRow.jsx';

/**
 * DataTable columns of the Workers list at lg+ (F-30): Name · Designation · Open orders · Status.
 * In the Active filter every row is Active, so the Status column is left out (`hideStatus`).
 */
export function workerColumns({ hideStatus = false } = {}) {
    const columns = [
        { key: 'name', header: 'Name', sortKey: 'name', minWidth: '14rem', render: (w) => w.name },
        {
            key: 'designation',
            header: 'Designation',
            width: '12rem',
            render: (w) => designationLabel(w.designation) || <span className="text-ink-subtle">—</span>,
        },
        {
            key: 'openOrders',
            header: 'Open orders',
            align: 'right',
            width: '9rem',
            sortKey: 'openOrders',
            sortDesc: true,
            render: (w) => <OpenOrders worker={w} compact />,
        },
    ];
    if (!hideStatus) columns.push({ key: 'status', header: 'Status', width: '9rem', render: (w) => <WorkerStatus worker={w} /> });
    return columns;
}
