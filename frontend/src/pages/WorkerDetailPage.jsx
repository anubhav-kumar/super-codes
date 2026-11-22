import { useParams } from 'react-router-dom';
import Badge from '../components/Badge.jsx';
import Button from '../components/Button.jsx';
import Card from '../components/Card.jsx';
import DataView from '../components/DataView.jsx';
import DetailField from '../components/DetailField.jsx';
import OfflineActionHint from '../components/OfflineActionHint.jsx';
import PageBody from '../components/PageBody.jsx';
import PageHeader from '../components/PageHeader.jsx';
import PageTitle from '../components/PageTitle.jsx';
import { designationLabel, WORKER_STATUS_TONE, workerStatusLabel } from '../constants/workers.js';
import useOnlineStatus from '../hooks/useOnlineStatus.js';
import { useWorker } from '../hooks/useWorkers.js';
import { formatDate } from '../utils/format.js';

/** Worker detail (F-04): all fields and status. Edit only; there is no delete (set Inactive instead). */
export default function WorkerDetailPage() {
    const { workerId } = useParams();
    const { online } = useOnlineStatus();
    const worker = useWorker(workerId);

    return (
        <PageBody width="detail">
            <PageHeader backTo="/workers" backLabel="Workers" />
            <DataView resource={worker}>
                {(w) => (
                    <>
                        <PageTitle
                            title={w.name}
                            subtitle={designationLabel(w.designation)}
                            actions={
                                <Button variant="secondary" icon="edit" to={`/workers/${w.id}/edit`} disabled={!online}>
                                    Edit
                                </Button>
                            }
                        />
                        {!online && <OfflineActionHint className="-mt-2 mb-4" />}
                        <Card>
                            <dl className="grid gap-4 md:grid-cols-2">
                                <DetailField label="Status">
                                    <Badge tone={WORKER_STATUS_TONE[w.status]}>{workerStatusLabel(w.status)}</Badge>
                                </DetailField>
                                <DetailField label="Designation" value={designationLabel(w.designation)} />
                                <DetailField label="Email">
                                    {w.email ? (
                                        <a href={`mailto:${w.email}`} className="text-ink underline-offset-2 hover:underline focus-visible:underline">
                                            {w.email}
                                        </a>
                                    ) : null}
                                </DetailField>
                                <DetailField label="Phone">
                                    {w.phone ? (
                                        <a href={`tel:${w.phone.replace(/[^\d+]/g, '')}`} className="text-ink underline-offset-2 hover:underline focus-visible:underline">
                                            {w.phone}
                                        </a>
                                    ) : null}
                                </DetailField>
                                <DetailField label="Joining date" value={formatDate(w.joiningDate)} />
                                <DetailField label="Notes" className="md:col-span-2">
                                    {w.notes ? <span className="whitespace-pre-line">{w.notes}</span> : null}
                                </DetailField>
                            </dl>
                        </Card>
                    </>
                )}
            </DataView>
        </PageBody>
    );
}
