import { useParams } from 'react-router-dom';
import Badge from '../components/Badge.jsx';
import Button from '../components/Button.jsx';
import DataView from '../components/DataView.jsx';
import FactList from '../components/FactList.jsx';
import OfflineActionHint from '../components/OfflineActionHint.jsx';
import PageBody from '../components/PageBody.jsx';
import PageHeader from '../components/PageHeader.jsx';
import RecordHeader from '../components/RecordHeader.jsx';
import Section from '../components/Section.jsx';
import Tag from '../components/Tag.jsx';
import WorkerOrdersSection from '../components/directory/WorkerOrdersSection.jsx';
import { designationLabel, WORKER_STATUS_TONE, workerStatusLabel } from '../constants/workers.js';
import useOnlineStatus from '../hooks/useOnlineStatus.js';
import { useWorker } from '../hooks/useWorkers.js';
import useRecordVisit from '../hooks/useRecordVisit.js';
import { formatDate } from '../utils/format.js';

const telHref = (phone) => `tel:${String(phone).replace(/[^\d+]/g, '')}`;

/**
 * Worker detail (F-04, F-30): header with designation and status (each shown once), compact facts
 * (empty ones hidden, "Add" links instead), and the worker's orders with relative due dates, open
 * first. Edit only; there is no delete (set Inactive instead).
 */
export default function WorkerDetailPage() {
    const { workerId } = useParams();
    const { online } = useOnlineStatus();
    const worker = useWorker(workerId);
    useRecordVisit('worker', workerId, worker);

    return (
        <PageBody width="detail">
            <PageHeader backTo="/workers" backLabel="Workers" />
            <DataView resource={worker} skeleton="detail" notFoundTitle="Worker not found">
                {(w) => {
                    const editTo = `/workers/${w.id}/edit`;
                    const facts = [
                        { label: 'Phone', value: w.phone, href: w.phone ? telHref(w.phone) : undefined, icon: 'phone' },
                        { label: 'Email', value: w.email, href: w.email ? `mailto:${w.email}` : undefined, icon: 'email' },
                        { label: 'Joining date', value: w.joiningDate ? formatDate(w.joiningDate) : null },
                        { label: 'Notes', value: w.notes, span: true },
                    ];
                    const addLinks = online
                        ? [!w.phone && { label: 'Add phone', to: editTo }, !w.email && { label: 'Add email', to: editTo }]
                        : [];
                    const hasFacts = facts.some((f) => f.value) || addLinks.some(Boolean);
                    return (
                        <>
                            <RecordHeader
                                eyebrow={<Tag>Worker</Tag>}
                                icon="workers"
                                title={w.name}
                                meta={[
                                    designationLabel(w.designation) ? (
                                        <span key="designation" className="text-ink-muted">
                                            {designationLabel(w.designation)}
                                        </span>
                                    ) : null,
                                    <Badge key="status" tone={WORKER_STATUS_TONE[w.status]}>
                                        {workerStatusLabel(w.status)}
                                    </Badge>,
                                ]}
                                actions={
                                    <Button variant="secondary" icon="edit" to={editTo} disabled={!online}>
                                        Edit
                                    </Button>
                                }
                            >
                                {!online && <OfflineActionHint />}
                            </RecordHeader>
                            <div className="flex flex-col gap-4">
                                {hasFacts && (
                                    <Section id="details" title="Details" flush={false}>
                                        <FactList items={facts} addLinks={addLinks} />
                                    </Section>
                                )}
                                <WorkerOrdersSection workerId={w.id} />
                            </div>
                        </>
                    );
                }}
            </DataView>
        </PageBody>
    );
}
