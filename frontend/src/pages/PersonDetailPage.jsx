import { useParams } from 'react-router-dom';
import BilledInvoicesSection from '../components/BilledInvoicesSection.jsx';
import Button from '../components/Button.jsx';
import Card from '../components/Card.jsx';
import ClientOrdersSection from '../components/ClientOrdersSection.jsx';
import DataView from '../components/DataView.jsx';
import DetailField from '../components/DetailField.jsx';
import OfflineActionHint from '../components/OfflineActionHint.jsx';
import PageBody from '../components/PageBody.jsx';
import PageHeader from '../components/PageHeader.jsx';
import RecordHeader from '../components/RecordHeader.jsx';
import PersonCompaniesSection from '../components/PersonCompaniesSection.jsx';
import PersonRequestedOrdersSection from '../components/PersonRequestedOrdersSection.jsx';
import useOnlineStatus from '../hooks/useOnlineStatus.js';
import { usePerson } from '../hooks/usePeople.js';
import Tag from '../components/Tag.jsx';

/**
 * Person detail (F-02). Later features add one line per section component below the details
 * card (F-03 companies, F-08 orders and invoices).
 */
export default function PersonDetailPage() {
    const { personId } = useParams();
    const { online } = useOnlineStatus();
    const person = usePerson(personId);

    return (
        <PageBody width="detail">
            <PageHeader backTo="/people" backLabel="People" />
            <DataView resource={person} skeleton="detail" notFoundTitle="Person not found">
                {(p) => (
                    <>
                        <RecordHeader
                            eyebrow={<Tag>{p.isIndividualClient ? 'Individual client' : 'Person'}</Tag>}
                            icon="PERSON"
                            title={p.name}
                            meta={p.pan ? <span className="font-mono text-[13px] text-ink-muted">PAN {p.pan}</span> : null}
                            actions={
                                <Button variant="secondary" icon="edit" to={`/people/${p.id}/edit`} disabled={!online}>
                                    Edit
                                </Button>
                            }
                        >
                            {!online && <OfflineActionHint />}
                        </RecordHeader>

                        <div className="flex flex-col gap-4">
                            <Card>
                                <dl className="grid gap-4 md:grid-cols-2">
                                    <DetailField
                                        label="Email"
                                        value={
                                            p.email ? (
                                                <a href={`mailto:${p.email}`} className="text-ink underline-offset-2 hover:underline focus-visible:underline">
                                                    {p.email}
                                                </a>
                                            ) : null
                                        }
                                    />
                                    <DetailField
                                        label="Phone"
                                        value={
                                            p.phone ? (
                                                <a href={`tel:${p.phone.replace(/[^\d+]/g, '')}`} className="text-ink underline-offset-2 hover:underline focus-visible:underline">
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
                            <PersonCompaniesSection companies={p.companies} />
                            <ClientOrdersSection clientId={p.id} title="Orders as client" />
                            <PersonRequestedOrdersSection personId={p.id} />
                            <BilledInvoicesSection billedToId={p.id} />
                        </div>
                    </>
                )}
            </DataView>
        </PageBody>
    );
}
