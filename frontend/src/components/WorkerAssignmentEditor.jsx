import { useId, useState } from 'react';
import { ORDER_LIMITS } from '../constants/orders.js';
import { designationLabel } from '../constants/workers.js';
import { useWorkers } from '../hooks/useWorkers.js';
import Badge from './Badge.jsx';
import Button from './Button.jsx';
import { FieldMessage } from './fieldStyles.jsx';
import SelectField from './SelectField.jsx';

/**
 * Edits the workers assigned to an order (F-05).
 *   value     [{ workerId, workerName, workerStatus, isPrimary }]
 *   onChange  receives the next list
 * Only Active workers are offered for adding; already assigned Inactive workers stay with an
 * "Inactive" badge and can be removed. The first worker added becomes primary owner. Removing the
 * primary owner leaves no primary and asks the user to choose a new one.
 */
export default function WorkerAssignmentEditor({ value = [], onChange, error, disabled = false }) {
    const workers = useWorkers();
    const groupId = useId();
    const [pick, setPick] = useState('');

    const assignedIds = new Set(value.map((a) => a.workerId));
    const options = (workers.data || [])
        .filter((w) => w.status === 'ACTIVE' && !assignedIds.has(w.id))
        .map((w) => ({ value: w.id, label: w.designation ? `${w.name} (${designationLabel(w.designation)})` : w.name }));
    const full = value.length >= ORDER_LIMITS.assignments;
    const missingPrimary = value.length > 0 && !value.some((a) => a.isPrimary);

    const add = (workerId) => {
        setPick('');
        const w = (workers.data || []).find((x) => x.id === workerId);
        if (!w || assignedIds.has(w.id)) return;
        const isPrimary = value.length === 0;
        onChange([...value, { workerId: w.id, workerName: w.name, workerStatus: w.status, isPrimary }]);
    };
    const remove = (workerId) => onChange(value.filter((a) => a.workerId !== workerId));
    const makePrimary = (workerId) => onChange(value.map((a) => ({ ...a, isPrimary: a.workerId === workerId })));

    let addHint;
    if (workers.status === 'loading') addHint = 'Loading workers…';
    else if (workers.status === 'unavailable' || workers.status === 'error') addHint = "Couldn't load workers.";
    else if (full) addHint = `At most ${ORDER_LIMITS.assignments} workers per order.`;
    else if (options.length === 0) addHint = 'No more active workers to assign.';

    return (
        <fieldset className="flex flex-col gap-2" aria-describedby={`${groupId}-msg`}>
            <legend className="mb-1.5 text-sm font-medium text-ink">Assigned workers</legend>
            {value.length === 0 ? (
                <p className="text-sm text-ink-muted">No workers assigned yet.</p>
            ) : (
                <ul className="divide-y divide-line rounded-card border border-line bg-surface">
                    {value.map((a) => (
                        <li key={a.workerId} className="flex min-h-12 flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2">
                            <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
                                <input
                                    type="radio"
                                    name={`${groupId}-primary`}
                                    checked={Boolean(a.isPrimary)}
                                    disabled={disabled}
                                    onChange={() => makePrimary(a.workerId)}
                                    className="h-5 w-5 shrink-0 accent-accent"
                                />
                                <span className="min-w-0">
                                    <span className="block truncate font-medium text-ink">{a.workerName || 'Unknown worker'}</span>
                                    <span className="block text-xs text-ink-muted">{a.isPrimary ? 'Primary owner' : 'Make primary owner'}</span>
                                </span>
                            </label>
                            {a.workerStatus === 'INACTIVE' && <Badge>Inactive</Badge>}
                            <Button variant="ghost" size="sm" disabled={disabled} onClick={() => remove(a.workerId)}>
                                Remove
                            </Button>
                        </li>
                    ))}
                </ul>
            )}
            {missingPrimary && !error && <p className="text-sm text-warning">Choose a new primary owner.</p>}
            <FieldMessage id={`${groupId}-msg`} error={error} />
            <SelectField
                label="Add worker"
                placeholder={options.length ? 'Choose an active worker' : 'No workers to add'}
                options={options}
                value={pick}
                onChange={add}
                disabled={disabled || full || options.length === 0}
                hint={addHint}
            />
        </fieldset>
    );
}
