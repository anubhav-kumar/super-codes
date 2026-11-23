import Badge from '../Badge.jsx';
import ListRow from '../ListRow.jsx';
import Section from '../Section.jsx';
import Tag from '../Tag.jsx';
import { designationLabel } from '../../constants/workers.js';
import { formatDate } from '../../utils/format.js';

/**
 * Workers section of order detail (F-36). Each row: worker name (+ "Inactive" badge), then
 * "Associate · Primary owner · Assigned 22 Nov 2026". The designation is the worker's current one
 * (`workerDesignation`, F-36); it is missing on offline copies cached before that deploy, which
 * reads as null. Empty items are dropped by ListRow / MetaLine, so no stray "·".
 */
export default function OrderWorkersSection({ assignments }) {
    return (
        <Section title="Workers" count={assignments.length || ''}>
            {assignments.length === 0 ? (
                <p className="px-4 pb-4 text-sm text-ink-muted">No workers assigned.</p>
            ) : (
                <ul className="divide-y divide-line border-t border-line">
                    {assignments.map((a) => (
                        <li key={a.workerId}>
                            <ListRow
                                to={`/workers/${a.workerId}`}
                                title={a.workerName || 'Unknown worker'}
                                trailing={a.workerStatus === 'INACTIVE' ? <Badge>Inactive</Badge> : undefined}
                                meta={[
                                    a.workerDesignation ? designationLabel(a.workerDesignation) : null,
                                    a.isPrimary ? <Tag key="primary">Primary owner</Tag> : null,
                                    a.assignedDate ? `Assigned ${formatDate(a.assignedDate)}` : null,
                                ]}
                            />
                        </li>
                    ))}
                </ul>
            )}
        </Section>
    );
}
