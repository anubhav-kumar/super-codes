import { useParams } from 'react-router-dom';
import BilledInvoicesSection from '../components/BilledInvoicesSection.jsx';
import Button from '../components/Button.jsx';
import ClientOrdersSection from '../components/ClientOrdersSection.jsx';
import DataView from '../components/DataView.jsx';
import FactList from '../components/FactList.jsx';
import OfflineActionHint from '../components/OfflineActionHint.jsx';
import PageBody from '../components/PageBody.jsx';
import PageHeader from '../components/PageHeader.jsx';
import PersonCompaniesSection from '../components/PersonCompaniesSection.jsx';
import PersonRequestedOrdersSection from '../components/PersonRequestedOrdersSection.jsx';
import RecordHeader from '../components/RecordHeader.jsx';
import Section from '../components/Section.jsx';
import Tag from '../components/Tag.jsx';
import ContactActions from '../components/profile/ContactActions.jsx';
import ProfileKeyFigures from '../components/profile/ProfileKeyFigures.jsx';
import { useBillingEntityInvoices } from '../hooks/useInvoices.js';
import useMediaQuery from '../hooks/useMediaQuery.js';
import useOnlineStatus from '../hooks/useOnlineStatus.js';
import { useClientOrders } from '../hooks/useOrders.js';
import { usePerson } from '../hooks/usePeople.js';
import useRecordVisit from '../hooks/useRecordVisit.js';

/** Contact facts; empty ones are hidden and offered as "Add …" links instead. PAN stays in the header. */
function PersonDetails({ person: p }) {
    const editTo = `/people/${p.id}/edit`;
    const items = [
        { label: 'Phone', value: p.phone, href: p.phone ? `tel:${p.phone.replace(/[^\d+]/g, '')}` : undefined, icon: 'phone' },
        { label: 'Email', value: p.email, href: p.email ? `mailto:${p.email}` : undefined, icon: 'email', span: true },
        { label: 'Address', value: p.address, span: true },
        { label: 'Notes', value: p.notes, span: true },
    ];
    const addLinks = [
        !p.phone && { label: 'Add phone', to: editTo },
        !p.email && { label: 'Add email', to: editTo },
        !p.address && { label: 'Add address', to: editTo },
    ];
    return (
        <Section id="details" title="Details" flush={false}>
            <FactList items={items} addLinks={addLinks} />
        </Section>
    );
}

/**
 * Person profile, summary first (F-27): header with PAN and contact buttons, key figures
 * (Outstanding, Overdue, Open orders), New order / New invoice with this person preselected,
 * then Open orders, Invoices, Companies, Orders requested and Details.
 * Phones: one column in that order. lg+: figures, details and companies left; orders and invoices right.
 * Orders and invoices load once here and feed both the figures and their sections.
 */
export default function PersonDetailPage() {
    const { personId } = useParams();
    const { online } = useOnlineStatus();
    const person = usePerson(personId);
    useRecordVisit('person', personId, person);
    const orders = useClientOrders(personId);
    const invoices = useBillingEntityInvoices(personId);
    const wide = useMediaQuery('(min-width: 1024px)');

    return (
        <PageBody width="detail">
            <PageHeader backTo="/people" backLabel="People" />
            <DataView resource={person} skeleton="detail" notFoundTitle="Person not found">
                {(p) => {
                    const preselect = `clientType=PERSON&clientId=${encodeURIComponent(p.id)}`;
                    const figures = <ProfileKeyFigures orders={orders} invoices={invoices} />;
                    const openOrders = <ClientOrdersSection orders={orders} />;
                    const billed = <BilledInvoicesSection invoices={invoices} />;
                    const companies = <PersonCompaniesSection companies={p.companies} />;
                    const requested = <PersonRequestedOrdersSection personId={p.id} />;
                    const details = <PersonDetails person={p} />;

                    return (
                        <>
                            <RecordHeader
                                eyebrow={<Tag>{p.isIndividualClient ? 'Individual client' : 'Person'}</Tag>}
                                icon="PERSON"
                                title={p.name}
                                meta={p.pan ? <span className="font-mono text-[13px] text-ink-muted">PAN {p.pan}</span> : null}
                                actions={
                                    <>
                                        {/* The order client picker only offers individual clients, so New order is hidden otherwise. */}
                                        {p.isIndividualClient && (
                                            <Button icon="plus" to={`/orders/new?${preselect}`} disabled={!online}>
                                                New order
                                            </Button>
                                        )}
                                        <Button
                                            variant={p.isIndividualClient ? 'secondary' : 'primary'}
                                            icon="raise-invoice"
                                            to={`/invoices/new?${preselect}`}
                                            disabled={!online}
                                        >
                                            New invoice
                                        </Button>
                                    </>
                                }
                                more={[{ label: 'Edit', icon: 'edit', to: `/people/${p.id}/edit`, disabled: !online }]}
                            >
                                <ContactActions phone={p.phone} email={p.email} />
                                {!online && <OfflineActionHint />}
                            </RecordHeader>

                            {wide ? (
                                <div className="grid grid-cols-[minmax(0,5fr)_minmax(0,7fr)] items-start gap-6">
                                    <div className="flex flex-col gap-4">
                                        {figures}
                                        {details}
                                        {companies}
                                    </div>
                                    <div className="flex flex-col gap-4">
                                        {openOrders}
                                        {billed}
                                        {requested}
                                    </div>
                                </div>
                            ) : (
                                <div className="flex flex-col gap-4">
                                    {figures}
                                    {openOrders}
                                    {billed}
                                    {companies}
                                    {requested}
                                    {details}
                                </div>
                            )}
                        </>
                    );
                }}
            </DataView>
        </PageBody>
    );
}
