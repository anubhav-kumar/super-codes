import ListItem from './ListItem.jsx';
import Section from './Section.jsx';

/**
 * Titled list block on a detail screen (a Section): count, list of ListItems, empty text and one
 * `action` (use SectionAction). items: [{ key, to, title, subtitle, meta, badges }]. `children`
 * replaces the default list (e.g. rows with their own actions); `footer` renders below the list.
 */
export default function RelatedSection({ id, title, count, items = [], emptyText = 'None yet.', action, children, footer, className = '' }) {
    const total = count ?? items.length;
    return (
        <Section id={id} title={title} count={total} action={action} className={className}>
            {children ??
                (items.length === 0 ? (
                    <p className="px-4 pb-4 text-sm text-ink-muted">{emptyText}</p>
                ) : (
                    <ul className="divide-y divide-line border-t border-line">
                        {items.map((item) => (
                            <li key={item.key}>
                                <ListItem to={item.to} title={item.title} subtitle={item.subtitle} meta={item.meta} badges={item.badges} />
                            </li>
                        ))}
                    </ul>
                ))}
            {footer}
        </Section>
    );
}
