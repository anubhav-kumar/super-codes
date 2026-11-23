import { useState } from 'react';
import { removeAssociation, updateAssociation } from '../../api/companies.js';
import { RELATIONSHIP_TYPES, relationshipLabel } from '../../constants/clients.js';
import useInlineSave from '../../hooks/useInlineSave.js';
import Button from '../Button.jsx';
import ClientIcon from '../ClientIcon.jsx';
import ConfirmDialog from '../ConfirmDialog.jsx';
import ListRow from '../ListRow.jsx';
import Menu from '../Menu.jsx';
import Section from '../Section.jsx';
import SectionAction from '../SectionAction.jsx';
import SelectField from '../SelectField.jsx';
import Sheet from '../Sheet.jsx';

const LAST_LINK_HINT = 'A company needs at least one person.';
const OFFLINE_HINT = 'Connect to the internet to edit.';
const NONE_HIDDEN = [];

const nameOf = (a) => a.personName || 'This person';

/** Small sheet with the relationship select; Save hands the new value back, the row saves it inline. */
function RelationshipSheet({ association, value, onSave, onClose }) {
    const [draft, setDraft] = useState(value);
    return (
        <Sheet
            open
            title={`Relationship of ${nameOf(association)}`}
            onClose={onClose}
            footer={
                <>
                    <Button variant="secondary" onClick={onClose}>
                        Cancel
                    </Button>
                    <Button disabled={!draft || draft === value} onClick={() => onSave(draft)}>
                        Save
                    </Button>
                </>
            }
        >
            <SelectField label="Relationship" options={RELATIONSHIP_TYPES} value={draft} onChange={setDraft} />
        </Sheet>
    );
}

function PersonLinkRow({ association: a, companyId, isLast, online, canManage, onChanged, onRemove }) {
    const relationship = useInlineSave(a.relationshipType);
    const [editing, setEditing] = useState(false);

    // Optimistic: the row shows the new relationship at once and rolls back with an error toast on failure.
    const changeRelationship = async (next) => {
        setEditing(false);
        if (!next || next === relationship.value) return;
        const result = await relationship.save(next, () => updateAssociation(companyId, a.personId, next), {
            success: `${nameOf(a)} is now ${relationshipLabel(next)}`,
        });
        if (result.ok) onChanged();
    };

    const busy = relationship.saving;
    return (
        <li className="flex items-center gap-1 pr-2">
            <ListRow
                to={a.canOpen === false ? undefined : `/people/${a.personId}`}
                className="min-w-0 flex-1"
                leading={<ClientIcon type="PERSON" />}
                title={a.personName || 'Unknown person'}
                meta={[relationship.saving ? 'Saving…' : relationshipLabel(relationship.value), a.personPhone]}
            />
            {canManage && (
                <Menu
                    label={`Actions for ${nameOf(a)}`}
                    icon="more"
                    sheetOnPhone
                    sheetTitle={nameOf(a)}
                    items={[
                        {
                            label: 'Change relationship',
                            icon: 'edit',
                            disabled: !online || busy,
                            hint: online ? undefined : OFFLINE_HINT,
                            onSelect: () => setEditing(true),
                        },
                        {
                            label: 'Remove link',
                            icon: 'unlink',
                            tone: 'danger',
                            disabled: !online || busy || isLast,
                            hint: isLast ? LAST_LINK_HINT : online ? undefined : OFFLINE_HINT,
                            onSelect: () => onRemove(a),
                        },
                    ]}
                />
            )}
            {editing && (
                <RelationshipSheet association={a} value={relationship.value} onSave={changeRelationship} onClose={() => setEditing(false)} />
            )}
        </li>
    );
}

/**
 * "People" section of the company profile (F-28), anchored at #people: each linked person with
 * relationship and phone; a row menu changes the relationship (sheet + inline save) or removes
 * the link (confirm, then inline save: the row disappears at once and comes back on failure).
 * A company keeps at least one person, so "Remove link" is disabled on the last one.
 * Members (`canManage` false, FR1 A3) get no Link person action and no row menu. A person the
 * member may not open (`canOpen: false`, P-26 F-55) is plain text, not a link.
 */
export default function CompanyPeopleSection({ company, online, reload, canManage = true }) {
    const associations = company.associations || [];
    const hidden = useInlineSave(NONE_HIDDEN);
    const [confirm, setConfirm] = useState(null);
    const visible = associations.filter((a) => !hidden.value.includes(a.personId));
    const isLast = visible.length <= 1;

    const onConfirmRemove = async () => {
        const target = confirm;
        setConfirm(null);
        const result = await hidden.save(
            [...hidden.value, target.personId],
            // 404: already removed (e.g. a retry after a dropped connection) -> treat as done.
            () =>
                removeAssociation(company.id, target.personId).catch((error) => {
                    if (error && error.status === 404) return null;
                    throw error;
                }),
            { success: `${nameOf(target)} unlinked from ${company.name}`, error: (e) => (e && e.message) || "Couldn't remove the link" }
        );
        if (result.ok) reload();
    };

    return (
        <>
            <Section
                id="people"
                title="People"
                count={visible.length}
                action={
                    canManage && (
                        <SectionAction icon="link" to={`/companies/${company.id}/people/new`} disabled={!online}>
                            Link person
                        </SectionAction>
                    )
                }
            >
                {visible.length === 0 ? (
                    <p className="px-4 pb-4 text-sm text-ink-muted">No people linked yet.</p>
                ) : (
                    <ul className="divide-y divide-line border-t border-line">
                        {visible.map((a) => (
                            <PersonLinkRow
                                key={a.personId}
                                association={a}
                                companyId={company.id}
                                isLast={isLast}
                                online={online}
                                canManage={canManage}
                                onChanged={reload}
                                onRemove={setConfirm}
                            />
                        ))}
                    </ul>
                )}
            </Section>
            <ConfirmDialog
                open={Boolean(confirm)}
                title="Remove link?"
                text={confirm ? `${nameOf(confirm)} will no longer be linked to ${company.name}. The person is not deleted.` : ''}
                confirmLabel="Remove link"
                tone="danger"
                onConfirm={onConfirmRemove}
                onCancel={() => setConfirm(null)}
            />
        </>
    );
}
