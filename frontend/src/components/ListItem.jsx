import { Link } from 'react-router-dom';
import Icon from './Icon.jsx';

/** Tappable list row: title, subtitle, right-side meta and badges, chevron. Renders a <Link>. */
export default function ListItem({ to, title, subtitle, meta, badges, className = '' }) {
    return (
        <Link
            to={to}
            className={`flex min-h-14 items-center gap-3 px-4 py-3 transition hover:bg-surface-subtle focus-visible:bg-surface-subtle focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent ${className}`}
        >
            <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-ink">{title}</p>
                {subtitle && <p className="truncate text-sm text-ink-muted">{subtitle}</p>}
            </div>
            {(meta || badges) && (
                <div className="flex shrink-0 flex-col items-end gap-1 text-right">
                    {meta && <span className="text-sm text-ink-muted tabular-nums">{meta}</span>}
                    {badges && <div className="flex flex-wrap justify-end gap-1">{badges}</div>}
                </div>
            )}
            <Icon name="chevron-right" className="h-4 w-4 shrink-0 text-ink-subtle" />
        </Link>
    );
}
