import ClientIcon from '../ClientIcon.jsx';
import ListRow from '../ListRow.jsx';
import { entityTypeLabel } from '../../constants/clients.js';
import { Missing, Outstanding } from './directoryText.jsx';

/** Companies list row (F-29). Line 1: name + outstanding. Line 2: entity type · main contact. */
export default function CompanyRow({ company }) {
    const contact = company.mainContact && company.mainContact.personName;
    return (
        <ListRow
            to={`/companies/${company.id}`}
            leading={<ClientIcon type="COMPANY" />}
            title={company.name}
            trailing={<Outstanding client={company} />}
            meta={[entityTypeLabel(company.entityType), contact || <Missing key="contact">No contact</Missing>]}
        />
    );
}
