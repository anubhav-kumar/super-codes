import { entityTypeLabel, relationshipLabel } from '../constants/clients.js';
import RelatedSection from './RelatedSection.jsx';

/** "Companies" section on the person detail screen (F-03): company name + relationship type. */
export default function PersonCompaniesSection({ companies = [] }) {
    const items = companies.map((c) => ({
        key: c.companyId,
        to: `/companies/${c.companyId}`,
        title: c.companyName || 'Unknown company',
        subtitle: relationshipLabel(c.relationshipType),
        meta: c.entityType ? entityTypeLabel(c.entityType) : undefined,
    }));
    return <RelatedSection title="Companies" items={items} emptyText="Not linked to any company. Link people from the company screen." />;
}
