import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import BilledInvoicesSection from '../components/BilledInvoicesSection.jsx';
import Button from '../components/Button.jsx';
import Card from '../components/Card.jsx';
import ClientOrdersSection from '../components/ClientOrdersSection.jsx';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import DataView from '../components/DataView.jsx';
import DetailField from '../components/DetailField.jsx';
import FormError from '../components/FormError.jsx';
import Icon from '../components/Icon.jsx';
import OfflineActionHint from '../components/OfflineActionHint.jsx';
import PageHeader from '../components/PageHeader.jsx';
import RelatedSection from '../components/RelatedSection.jsx';
import SelectField from '../components/SelectField.jsx';
import { removeAssociation, updateAssociation } from '../api/companies.js';
import { entityTypeLabel, RELATIONSHIP_TYPES, relationshipLabel } from '../constants/clients.js';
import { useCompany } from '../hooks/useCompanies.js';
import useOnlineStatus from '../hooks/useOnlineStatus.js';
import useSubmit from '../hooks/useSubmit.js';

const LAST_LINK_HINT = 'A company needs at least one person.';

function AssociationRow({ association, isLast, online, open, onToggle, onChangeType, onRemove, saving }) {
    const a = association;
    return (
        <li>
            <div className="flex min-h-14 items-center gap-2 pr-2">
                <Link
                    to={`/people/${a.personId}`}
                    className="flex min-w-0 flex-1 items-center gap-3 px-4 py-3 transition hover:bg-surface-subtle focus-visible:bg-surface-subtle focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
                >
                    <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium text-ink">{a.personName || 'Unknown person'}</span>
                        <span className="block truncate text-sm text-ink-muted">
                            {relationshipLabel(a.relationshipType)}
                            {a.personPhone ? ` · ${a.personPhone}` : ''}
                        </span>
                    </span>
                </Link>
                <button
                    type="button"
                    onClick={onToggle}
                    aria-expanded={open}
                    aria-label={`Actions for ${a.personName || 'this person'}`}
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-control text-ink-muted hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-accent"
                >
                    <Icon name={open ? 'close' : 'more'} />
                </button>
            </div>
            {open && (
                <div className="flex flex-col gap-3 border-t border-line bg-surface-subtle px-4 py-3">
                    <SelectField
                        label="Change relationship"
                        options={RELATIONSHIP_TYPES}
                        value={a.relationshipType}
                        disabled={!online || saving}
                        onChange={(value) => value && value !== a.relationshipType && onChangeType(value)}
                    />
                    <div className="flex flex-wrap items-center gap-3">
                        <Button variant="secondary" size="sm" disabled={!online || isLast || saving} onClick={onRemove}>
                            Remove link
                        </Button>
                        {isLast && <span className="text-sm text-ink-muted">{LAST_LINK_HINT}</span>}
                    </div>
                    {!online && <OfflineActionHint />}
                </div>
            )}
        </li>
    );
}

function CompanyPeopleSection({ company, online, reload }) {
    const associations = company.associations || [];
    const [openId, setOpenId] = useState(null);
    const [confirm, setConfirm] = useState(null);
    const change = useSubmit();
    const remove = useSubmit();
    const isLast = associations.length <= 1;

    const onChangeType = async (personId, relationshipType) => {
        const result = await change.submit(() => updateAssociation(company.id, personId, relationshipType));
        if (result.ok) reload();
    };

    const onConfirmRemove = async () => {
        const target = confirm;
        const result = await remove.submit(() => removeAssociation(company.id, target.personId));
        setConfirm(null);
        // 404: already removed (e.g. a retry after a dropped connection) -> just refresh.
        if (result.ok || (result.error && result.error.status === 404)) {
            remove.clearErrors();
            setOpenId(null);
            reload();
        }
    };

    return (
        <>
            <RelatedSection
                title="People"
                count={associations.length}
                action={
                    <Button variant="ghost" size="sm" icon="link" to={`/companies/${company.id}/people/new`} disabled={!online}>
                        Link person
                    </Button>
                }
            >
                {(change.formError || remove.formError) && (
                    <div className="px-4 pb-3">
                        <FormError message={remove.formError || change.formError} />
                    </div>
                )}
                {associations.length === 0 ? (
                    <p className="px-4 pb-4 text-sm text-ink-muted">No people linked yet.</p>
                ) : (
                    <ul className="divide-y divide-line border-t border-line">
                        {associations.map((a) => (
                            <AssociationRow
                                key={a.personId}
                                association={a}
                                isLast={isLast}
                                online={online}
                                open={openId === a.personId}
                                saving={change.submitting || remove.submitting}
                                onToggle={() => setOpenId((id) => (id === a.personId ? null : a.personId))}
                                onChangeType={(type) => onChangeType(a.personId, type)}
                                onRemove={() => setConfirm(a)}
                            />
                        ))}
                    </ul>
                )}
            </RelatedSection>
            <ConfirmDialog
                open={Boolean(confirm)}
                title="Remove link?"
                text={confirm ? `${confirm.personName || 'This person'} will no longer be linked to ${company.name}. The person is not deleted.` : ''}
                confirmLabel="Remove link"
                tone="danger"
                busy={remove.submitting}
                onConfirm={onConfirmRemove}
                onCancel={() => setConfirm(null)}
            />
        </>
    );
}

/**
 * Company detail (F-03). Later features add one line per section component below the People
 * section (F-08 orders, invoices and outstanding).
 */
export default function CompanyDetailPage() {
    const { companyId } = useParams();
    const { online } = useOnlineStatus();
    const company = useCompany(companyId);

    return (
        <DataView resource={company}>
            {(c) => (
                <>
                    <PageHeader
                        title={c.name}
                        subtitle={entityTypeLabel(c.entityType)}
                        actions={
                            <Button variant="secondary" icon="edit" to={`/companies/${c.id}/edit`} disabled={!online}>
                                Edit
                            </Button>
                        }
                    />
                    {!online && <OfflineActionHint className="-mt-2 mb-4" />}

                    <div className="flex flex-col gap-4">
                        <Card>
                            <dl className="grid gap-4 md:grid-cols-2">
                                <DetailField label="PAN" value={c.pan ? <span className="font-mono text-[13px]">{c.pan}</span> : null} />
                                <DetailField label="Entity type" value={entityTypeLabel(c.entityType) || null} />
                                <DetailField label="GSTIN" value={c.gstin ? <span className="font-mono text-[13px]">{c.gstin}</span> : null} />
                                <DetailField
                                    label="Email"
                                    value={
                                        c.email ? (
                                            <a href={`mailto:${c.email}`} className="text-ink underline-offset-2 hover:underline focus-visible:underline">
                                                {c.email}
                                            </a>
                                        ) : null
                                    }
                                />
                                <DetailField
                                    label="Phone"
                                    value={
                                        c.phone ? (
                                            <a href={`tel:${c.phone.replace(/[^\d+]/g, '')}`} className="text-ink underline-offset-2 hover:underline focus-visible:underline">
                                                {c.phone}
                                            </a>
                                        ) : null
                                    }
                                />
                                <DetailField
                                    label="Registered address"
                                    value={c.address ? <span className="whitespace-pre-line">{c.address}</span> : null}
                                />
                                <DetailField
                                    label="Notes"
                                    value={c.notes ? <span className="whitespace-pre-line">{c.notes}</span> : null}
                                    className="md:col-span-2"
                                />
                            </dl>
                        </Card>

                        <CompanyPeopleSection company={c} online={online} reload={company.reload} />

                        {/* Sections added by later features, one line each */}
                        <ClientOrdersSection clientId={c.id} />
                        <BilledInvoicesSection billedToId={c.id} />
                    </div>
                </>
            )}
        </DataView>
    );
}
