import { useParams } from 'react-router-dom';
import Badge from '../components/Badge.jsx';
import Button from '../components/Button.jsx';
import Card from '../components/Card.jsx';
import DataView from '../components/DataView.jsx';
import DetailField from '../components/DetailField.jsx';
import OfflineActionHint from '../components/OfflineActionHint.jsx';
import PageHeader from '../components/PageHeader.jsx';
import useOnlineStatus from '../hooks/useOnlineStatus.js';
import { usePerson } from '../hooks/usePeople.js';

/**
 * Person detail (F-02). Later features add one line per section component below the details
 * card (F-03 companies, F-08 orders and invoices).
 */
export default function PersonDetailPage() {
    const { personId } = useParams();
    const { online } = useOnlineStatus();
    const person = usePerson(personId);

    return (
        <DataView resource={person}>
            {(p) => (
                <>
                    <PageHeader
                        title={p.name}
                        subtitle={p.isIndividualClient ? <Badge tone="info">Individual client</Badge> : undefined}
                        actions={
                            <Button variant="secondary" icon="edit" to={`/people/${p.id}/edit`} disabled={!online}>
                                Edit
                            </Button>
                        }
                    />
                    {!online && <OfflineActionHint className="-mt-2 mb-4" />}

                    <div className="flex flex-col gap-4">
                        <Card>
                            <dl className="grid gap-4 md:grid-cols-2">
                                <DetailField label="PAN" value={p.pan ? <span className="font-mono">{p.pan}</span> : null} />
                                <DetailField
                                    label="Email"
                                    value={
                                        p.email ? (
                                            <a href={`mailto:${p.email}`} className="text-primary-700 hover:underline">
                                                {p.email}
                                            </a>
                                        ) : null
                                    }
                                />
                                <DetailField
                                    label="Phone"
                                    value={
                                        p.phone ? (
                                            <a href={`tel:${p.phone.replace(/[^\d+]/g, '')}`} className="text-primary-700 hover:underline">
                                                {p.phone}
                                            </a>
                                        ) : null
                                    }
                                />
                                <DetailField label="Address" value={p.address ? <span className="whitespace-pre-line">{p.address}</span> : null} />
                                <DetailField
                                    label="Notes"
                                    value={p.notes ? <span className="whitespace-pre-line">{p.notes}</span> : null}
                                    className="md:col-span-2"
                                />
                            </dl>
                        </Card>

                        {/* Sections added by later features, one line each */}
                    </div>
                </>
            )}
        </DataView>
    );
}
