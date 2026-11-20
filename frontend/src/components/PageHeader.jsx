/** Screen title, optional subtitle and action buttons, shown at the top of the page content. */
export default function PageHeader({ title, subtitle, actions, className = '' }) {
    return (
        <div className={`mb-4 flex flex-wrap items-start justify-between gap-3 ${className}`}>
            <div className="min-w-0">
                <h1 className="text-xl font-semibold text-ink sm:text-2xl">{title}</h1>
                {subtitle && <p className="mt-0.5 text-sm text-ink-muted">{subtitle}</p>}
            </div>
            {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
    );
}
