import Tag from '../Tag.jsx';
import { entityTypeLabel, relationshipLabel } from '../../constants/clients.js';
import { CompanyLinks, Missing, Outstanding } from './directoryText.jsx';

const dash = <span className="text-ink-subtle">—</span>;
const mono = (value) => (value ? <span className="tabular-nums">{value}</span> : dash);

/**
 * DataTable columns of the People list at lg+ (F-29): Name · PAN · Phone · Companies · Outstanding.
 * Name columns get priority width (F-33): at least 15rem, so names up to about 25 characters stay on
 * one line; quiet tags sit under the name instead of beside it.
 */
export const PEOPLE_COLUMNS = [
    {
        key: 'name',
        header: 'Name',
        sortKey: 'name',
        minWidth: '15rem',
        render: (p) => (
            <>
                {p.name}
                {p.isIndividualClient && <Tag className="mt-0.5 block">Individual client</Tag>}
            </>
        ),
    },
    { key: 'pan', header: 'PAN', width: '9rem', render: (p) => mono(p.pan) },
    { key: 'phone', header: 'Phone', width: '10rem', render: (p) => (p.phone ? mono(p.phone) : <Missing>No phone</Missing>) },
    { key: 'companies', header: 'Companies', render: (p) => (p.companies.length > 0 ? <CompanyLinks person={p} /> : dash) },
    {
        key: 'outstanding',
        header: 'Outstanding',
        align: 'right',
        width: '9rem',
        sortKey: 'outstanding',
        sortDesc: true,
        render: (p) => <Outstanding client={p} dash />,
    },
];

/** DataTable columns of the Companies list at lg+ (F-29): Name · Entity type · PAN · Main contact · Outstanding. */
export const COMPANY_COLUMNS = [
    { key: 'name', header: 'Name', sortKey: 'name', minWidth: '15rem', render: (c) => c.name },
    { key: 'entityType', header: 'Entity type', width: '9rem', render: (c) => entityTypeLabel(c.entityType) || dash },
    { key: 'pan', header: 'PAN', width: '9rem', render: (c) => mono(c.pan) },
    {
        key: 'mainContact',
        header: 'Main contact',
        render: (c) =>
            c.mainContact && c.mainContact.personName ? (
                <>
                    {c.mainContact.personName}
                    <Tag className="mt-0.5 block">{relationshipLabel(c.mainContact.relationshipType)}</Tag>
                </>
            ) : (
                <Missing>No contact</Missing>
            ),
    },
    {
        key: 'outstanding',
        header: 'Outstanding',
        align: 'right',
        width: '9rem',
        sortKey: 'outstanding',
        sortDesc: true,
        render: (c) => <Outstanding client={c} dash />,
    },
];
