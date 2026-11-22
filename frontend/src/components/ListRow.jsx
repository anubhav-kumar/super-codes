import { Children, Fragment } from 'react';
import { Link } from 'react-router-dom';

/**
 * Two-line list row (whole row is one link, min 64 px):
 *   line 1: `leading` icon · `title` (medium, wraps up to 2 lines, never cut to one) · `trailing` on the right
 *   line 2: `meta` items joined by "·" (wraps) · `trailingMeta` on the right
 *   <ListRow to="/orders/1" leading={<ClientIcon type="PERSON" />} title="Ravi Mehta"
 *            trailing={<Badge>New</Badge>} meta={['GST Return Filing', <DueLabel … />]} />
 * Falsy meta items are skipped. Without `to` it renders a plain block (for rows with own controls).
 */
export default function ListRow({ to, leading, title, trailing, meta, trailingMeta, className = '', ...rest }) {
    const parts = Children.toArray(Array.isArray(meta) ? meta.filter((m) => m !== null && m !== undefined && m !== false && m !== '') : meta);
    const classes = `flex min-h-16 items-start gap-3 px-4 py-3 ${to ? 'transition hover:bg-surface-subtle focus-visible:bg-surface-subtle focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent' : ''} ${className}`;

    const body = (
        <>
            {leading && <span className="flex shrink-0 items-center pt-0.5">{leading}</span>}
            <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="flex items-start justify-between gap-3">
                    <span className="line-clamp-2 min-w-0 text-[15px]/[22px] font-medium break-words text-ink md:text-sm/5">{title}</span>
                    {trailing && <span className="flex shrink-0 items-center gap-1 text-right">{trailing}</span>}
                </span>
                {(parts.length > 0 || trailingMeta) && (
                    <span className="flex items-start justify-between gap-3">
                        <span className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-sm text-ink-muted md:text-[13px]/[18px]">
                            {parts.map((part, i) => (
                                <Fragment key={part.key ?? i}>
                                    {i > 0 && (
                                        <span aria-hidden="true" className="text-ink-subtle">
                                            ·
                                        </span>
                                    )}
                                    <span className="inline-flex items-center">{part}</span>
                                </Fragment>
                            ))}
                        </span>
                        {trailingMeta && <span className="shrink-0 text-right text-sm text-ink-muted md:text-[13px]/[18px]">{trailingMeta}</span>}
                    </span>
                )}
            </span>
        </>
    );

    if (!to) {
        return (
            <div className={classes} {...rest}>
                {body}
            </div>
        );
    }
    return (
        <Link to={to} className={classes} {...rest}>
            {body}
        </Link>
    );
}
