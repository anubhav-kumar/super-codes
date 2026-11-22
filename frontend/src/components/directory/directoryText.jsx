import Money from '../Money.jsx';
import { relationshipLabel } from '../../constants/clients.js';

/** Outstanding amount of a directory row: shown only above 0, red only when an invoice is overdue (F-29). */
export function Outstanding({ client, dash = false }) {
    if (!(client.outstanding > 0)) return dash ? <span className="text-ink-subtle">—</span> : null;
    return <Money value={client.outstanding} overdue={client.hasOverdueInvoice} />;
}

/** A quiet placeholder for a missing value ("No phone"), so rows keep their height. */
export function Missing({ children }) {
    return <span className="text-ink-subtle">{children}</span>;
}

/** "Director at JSCB Ltd." for a person's first company link (companies[] is first link first). */
export function firstLinkText(person) {
    const link = person.companies && person.companies[0];
    if (!link) return '';
    return `${relationshipLabel(link.relationshipType)} at ${link.companyName || 'a company'}`;
}

/** "+1 more" when a person is linked to more than one company. */
export function moreLinksText(person) {
    const extra = (person.companies ? person.companies.length : 0) - 1;
    return extra > 0 ? `+${extra} more` : '';
}

/** Company link summary: "Director at JSCB Ltd." followed by a quiet "+1 more". */
export function CompanyLinks({ person }) {
    const first = firstLinkText(person);
    if (!first) return null;
    const more = moreLinksText(person);
    return (
        <span>
            {first}
            {more && <span className="text-ink-subtle"> {more}</span>}
        </span>
    );
}
