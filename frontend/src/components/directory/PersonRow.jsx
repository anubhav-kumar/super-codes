import ClientIcon from '../ClientIcon.jsx';
import ListRow from '../ListRow.jsx';
import { CompanyLinks, Missing, Outstanding } from './directoryText.jsx';

/**
 * People list row (F-29). Line 1: name + outstanding (red only when an invoice is overdue).
 * Line 2: "PAN · phone" for individual clients, otherwise "Director at JSCB Ltd. +1 more".
 * Line 2 always has content, so rows keep one height whether or not a phone is set.
 */
export default function PersonRow({ person }) {
    const showLinks = !person.isIndividualClient && person.companies.length > 0;
    const meta = showLinks
        ? [<CompanyLinks key="links" person={person} />]
        : [
              person.pan ? (
                  <span key="pan" className="tabular-nums">
                      {person.pan}
                  </span>
              ) : null,
              person.phone ? (
                  <span key="phone" className="tabular-nums">
                      {person.phone}
                  </span>
              ) : (
                  <Missing key="phone">No phone</Missing>
              ),
          ];

    return (
        <ListRow
            to={`/people/${person.id}`}
            leading={<ClientIcon type="PERSON" />}
            title={person.name}
            trailing={<Outstanding client={person} />}
            meta={meta}
        />
    );
}
