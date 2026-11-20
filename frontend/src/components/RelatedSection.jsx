import ListItem from './ListItem.jsx';

/**
 * Titled block on a detail screen: count, list of ListItems, empty text, optional action.
 * items: [{ key, to, title, subtitle, meta, badges }]. `children` replaces the default list
 * (e.g. rows with their own actions); `footer` renders below the list.
 */
export default function RelatedSection({ title, count, items = [], emptyText = 'None yet.', action, children, footer, className = '' }) {
    const total = count ?? items.length;
    return (
        <section className={`rounded-card border border-line bg-surface ${className}`}>
            <div className="flex items-center justify-between gap-3 px-4 pt-4 pb-3">
                <h2 className="text-base font-semibold text-ink">
                    {title}
                    <span className="ml-2 text-sm font-normal text-ink-muted tabular-nums">{total}</span>
                </h2>
                {action}
            </div>
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
        </section>
    );
}
