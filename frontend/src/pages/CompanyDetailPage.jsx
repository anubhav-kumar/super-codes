import { useParams } from 'react-router-dom';
import BilledInvoicesSection from '../components/BilledInvoicesSection.jsx';
import Button from '../components/Button.jsx';
import ClientOrdersSection from '../components/ClientOrdersSection.jsx';
import DataView from '../components/DataView.jsx';
import FactList from '../components/FactList.jsx';
import OfflineActionHint from '../components/OfflineActionHint.jsx';
import PageBody from '../components/PageBody.jsx';
import PageHeader from '../components/PageHeader.jsx';
import RecordHeader from '../components/RecordHeader.jsx';
import Section from '../components/Section.jsx';
import Tag from '../components/Tag.jsx';
import CompanyPeopleSection from '../components/profile/CompanyPeopleSection.jsx';
import ContactActions from '../components/profile/ContactActions.jsx';
import ProfileKeyFigures from '../components/profile/ProfileKeyFigures.jsx';
import { entityTypeLabel } from '../constants/clients.js';
import { useCompany } from '../hooks/useCompanies.js';
import { useBillingEntityInvoices } from '../hooks/useInvoices.js';
import useMediaQuery from '../hooks/useMediaQuery.js';
import useOnlineStatus from '../hooks/useOnlineStatus.js';
import { useClientOrders } from '../hooks/useOrders.js';
import useRecordVisit from '../hooks/useRecordVisit.js';
import useRole from '../hooks/useRole.js';

/** Company facts; empty ones are hidden and offered as "Add …" links instead. PAN stays in the header. */
function CompanyDetails({ company: c }) {
    const editTo = `/companies/${c.id}/edit`;
    const items = [
        { label: 'Phone', value: c.phone, href: c.phone ? `tel:${c.phone.replace(/[^\d+]/g, '')}` : undefined, icon: 'phone' },
        { label: 'GSTIN', value: c.gstin, mono: true },
        { label: 'Email', value: c.email, href: c.email ? `mailto:${c.email}` : undefined, icon: 'email', span: true },
        { label: 'Registered address', value: c.address, span: true },
        { label: 'Notes', value: c.notes, span: true },
    ];
    const addLinks = [
        !c.phone && { label: 'Add phone', to: editTo },
        !c.email && { label: 'Add email', to: editTo },
        !c.gstin && { label: 'Add GSTIN', to: editTo },
        !c.address && { label: 'Add address', to: editTo },
    ];
    return (
        <Section id="details" title="Details" flush={false}>
            <FactList items={items} addLinks={addLinks} />
        </Section>
    );
}

/**
 * Company profile, summary first (F-28): header with entity type, PAN and contact buttons, key
 * figures (Outstanding, Overdue, Open orders), New order / New invoice with this company
 * preselected, then Open orders, Invoices, People and Details.
 * Phones: one column in that order. lg+: figures in one full-width row, then details and people left; orders and invoices right.
 * Orders and invoices load once here and feed both the figures and their sections.
 * Members (P-26 F-55): no New order / New invoice and no people link actions; Edit stays; figures
 * come from their scoped orders and invoices.
 */
export default function CompanyDetailPage() {
    const { companyId } = useParams();
    const { online } = useOnlineStatus();
    const { isAdmin } = useRole();
    const company = useCompany(companyId);
    useRecordVisit('company', companyId, company);
    const orders = useClientOrders(companyId);
    const invoices = useBillingEntityInvoices(companyId);
    const wide = useMediaQuery('(min-width: 1024px)');

    return (
        <PageBody width="detail">
            <PageHeader backTo="/companies" backLabel="Companies" />
            <DataView resource={company} skeleton="detail" notFoundTitle="Company not found">
                {(c) => {
                    const preselect = `clientType=COMPANY&clientId=${encodeURIComponent(c.id)}`;
                    const figures = <ProfileKeyFigures orders={orders} invoices={invoices} />;
                    const openOrders = <ClientOrdersSection orders={orders} showReceivedFrom />;
                    const billed = <BilledInvoicesSection invoices={invoices} />;
                    const people = <CompanyPeopleSection company={c} online={online} reload={company.reload} canManage={isAdmin} />;
                    const details = <CompanyDetails company={c} />;

                    return (
                        <>
                            <RecordHeader
                                eyebrow={<Tag>{entityTypeLabel(c.entityType) || 'Company'}</Tag>}
                                icon="COMPANY"
                                title={c.name}
                                meta={c.pan ? <span className="font-mono text-[13px] text-ink-muted">PAN {c.pan}</span> : null}
                                actions={
                                    isAdmin && (
                                        <>
                                            <Button icon="plus" to={`/orders/new?${preselect}`} disabled={!online}>
                                                New order
                                            </Button>
                                            <Button variant="secondary" icon="raise-invoice" to={`/invoices/new?${preselect}`} disabled={!online}>
                                                New invoice
                                            </Button>
                                        </>
                                    )
                                }
                                more={[{ label: 'Edit', icon: 'edit', to: `/companies/${c.id}/edit`, disabled: !online }]}
                            >
                                <ContactActions phone={c.phone} email={c.email} />
                                {!online && <OfflineActionHint />}
                            </RecordHeader>

                            {wide ? (
                                <div className="flex flex-col gap-4">
                                    {figures}
                                    <div className="grid grid-cols-[minmax(0,5fr)_minmax(0,7fr)] items-start gap-6">
                                        <div className="flex flex-col gap-4">
                                            {details}
                                            {people}
                                        </div>
                                        <div className="flex flex-col gap-4">
                                            {openOrders}
                                            {billed}
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="flex flex-col gap-4">
                                    {figures}
                                    {openOrders}
                                    {billed}
                                    {people}
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
