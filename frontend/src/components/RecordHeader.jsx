import ClientIcon from './ClientIcon.jsx';
import Icon from './Icon.jsx';
import Menu from './Menu.jsx';

const MORE_TRIGGER =
    'inline-flex h-11 w-11 items-center justify-center rounded-control border border-line bg-surface text-ink shadow-raised transition hover:bg-surface-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:text-ink-subtle md:h-10 md:w-10';

function Leading({ icon }) {
    if (!icon) return null;
    if (icon === 'PERSON' || icon === 'COMPANY') return <ClientIcon type={icon} size="header" />;
    if (typeof icon === 'string') {
        return (
            <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface-muted text-ink-muted">
                <Icon name={icon} />
            </span>
        );
    }
    return icon;
}

/**
 * Top block of every detail screen; the record title lives here once (the top bar only has Back).
 *   <RecordHeader
 *       eyebrow={<RecordNo>ORD-0003</RecordNo>}         quiet line above the title (number, type tag)
 *       icon="COMPANY"                                   'PERSON' / 'COMPANY', an icon name, or a node
 *       title="GST Return Filing"                        h1; wraps, never truncates
 *       subtitle={<Link …>Ravi Mehta</Link>}             one line under the title
 *       meta={[<Badge …/>, <DueLabel …/>]}               wrapping row: status, due label, PAN
 *       actions={<><Button>Raise invoice</Button><Button variant="secondary">Edit</Button></>}
 *       more={[{ label: 'Cancel invoice', tone: 'danger', onSelect }]}   items of the "More" menu
 *   >optional content under the header (e.g. offline hint, contact buttons)</RecordHeader>
 * Phones: actions in a full-width row under the title, primary first; md+: actions right of the title.
 */
export default function RecordHeader({ eyebrow, icon, title, subtitle, meta, actions, more, moreDisabled = false, children, className = '' }) {
    const metaItems = (Array.isArray(meta) ? meta : [meta]).filter((m) => m !== null && m !== undefined && m !== false && m !== '');
    const moreItems = (more || []).filter(Boolean);
    const hasActions = Boolean(actions) || moreItems.length > 0;

    return (
        <header className={`mb-4 flex flex-col gap-3 md:mb-6 ${className}`}>
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between md:gap-6">
                <div className="flex min-w-0 items-start gap-3">
                    <Leading icon={icon} />
                    <div className="min-w-0">
                        {eyebrow && <div className="mb-0.5 flex flex-wrap items-center gap-2 text-xs text-ink-subtle">{eyebrow}</div>}
                        <h1 className="text-xl/7 font-semibold tracking-tight break-words text-ink md:text-2xl/8">{title}</h1>
                        {subtitle && <div className="mt-0.5 text-sm text-ink-muted">{subtitle}</div>}
                        {metaItems.length > 0 && (
                            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm">
                                {metaItems.map((m, i) => (
                                    <span key={(m && m.key) ?? i} className="inline-flex items-center">
                                        {m}
                                    </span>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
                {hasActions && (
                    <div className="flex w-full flex-wrap items-center gap-2 md:w-auto md:shrink-0 md:justify-end">
                        {actions}
                        {moreItems.length > 0 && (
                            <Menu label="More actions" icon="more" items={moreItems} sheetOnPhone disabled={moreDisabled} triggerClassName={MORE_TRIGGER} />
                        )}
                    </div>
                )}
            </div>
            {children}
        </header>
    );
}
