import { Link } from 'react-router-dom';
import Icon from './Icon.jsx';

const linkClass = 'text-ink underline-offset-2 hover:underline focus-visible:underline';

const isEmpty = (v) => v === null || v === undefined || v === '' || v === false;

/**
 * Compact facts in a two-column grid at every width (wide values `span` both columns).
 *   <FactList items={[
 *       { label: 'Phone', value: p.phone, href: `tel:${p.phone}`, icon: 'phone' },
 *       { label: 'PAN', value: p.pan, mono: true },
 *       { label: 'Notes', value: p.notes, span: true },
 *   ]} addLinks={[{ label: 'Add GSTIN', to: `/companies/${id}/edit` }]} />
 * Empty values are skipped (no "Not set"). `href` makes the value an external/tel/mailto link,
 * `to` an in-app link. Text keeps its line breaks. `addLinks` render as small links after the grid.
 */
export default function FactList({ items = [], addLinks = [], className = '' }) {
    const facts = items.filter((item) => item && !isEmpty(item.value));
    const links = addLinks.filter(Boolean);
    if (facts.length === 0 && links.length === 0) return null;

    return (
        <div className={className}>
            {facts.length > 0 && (
                <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
                    {facts.map((item) => {
                        const text = typeof item.value === 'string' ? <span className="whitespace-pre-line">{item.value}</span> : item.value;
                        let value = text;
                        if (item.href) {
                            value = (
                                <a href={item.href} className={linkClass}>
                                    {text}
                                </a>
                            );
                        } else if (item.to) {
                            value = (
                                <Link to={item.to} className={linkClass}>
                                    {text}
                                </Link>
                            );
                        }
                        return (
                            <div key={item.key || item.label} className={`flex min-w-0 flex-col gap-0.5 ${item.span ? 'col-span-2' : ''}`}>
                                <dt className="flex items-center gap-1.5 text-sm text-ink-muted md:text-[13px]/[18px]">
                                    {item.icon && <Icon name={item.icon} size="sm" className="text-ink-subtle" />}
                                    {item.label}
                                </dt>
                                <dd className={`break-words text-ink ${item.mono ? 'font-mono text-[13px]' : 'text-[15px]/[22px] md:text-sm/5'}`}>{value}</dd>
                            </div>
                        );
                    })}
                </dl>
            )}
            {links.length > 0 && (
                <div className={`flex flex-wrap gap-x-4 gap-y-1 ${facts.length > 0 ? 'mt-3' : ''}`}>
                    {links.map((l) => (
                        <Link
                            key={l.label}
                            to={l.to}
                            className="inline-flex min-h-11 items-center gap-1.5 rounded-control text-sm font-medium text-ink-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent md:min-h-8"
                        >
                            <Icon name="plus" size="sm" />
                            {l.label}
                        </Link>
                    ))}
                </div>
            )}
        </div>
    );
}
