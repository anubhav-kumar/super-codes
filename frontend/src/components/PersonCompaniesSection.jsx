import { entityTypeLabel, relationshipLabel } from '../constants/clients.js';
import ClientIcon from './ClientIcon.jsx';
import ListRow from './ListRow.jsx';
import Section from './Section.jsx';

/**
 * "Companies" section on the person profile (F-03), anchored at #companies: company name, relationship, entity type.
 * A company the member may not open (`canOpen: false`, P-26 F-55) is plain text, not a link; a missing flag means it can be opened.
 */
export default function PersonCompaniesSection({ companies = [] }) {
    return (
        <Section id="companies" title="Companies" count={companies.length}>
            {companies.length === 0 ? (
                <p className="px-4 pb-4 text-sm text-ink-muted">Not linked to any company. Link people from the company screen.</p>
            ) : (
                <ul className="divide-y divide-line border-t border-line">
                    {companies.map((c) => (
                        <li key={c.companyId}>
                            <ListRow
                                to={c.canOpen === false ? undefined : `/companies/${c.companyId}`}
                                leading={<ClientIcon type="COMPANY" />}
                                title={c.companyName || 'Unknown company'}
                                meta={[relationshipLabel(c.relationshipType), c.entityType ? entityTypeLabel(c.entityType) : null]}
                            />
                        </li>
                    ))}
                </ul>
            )}
        </Section>
    );
}
