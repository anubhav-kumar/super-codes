/**
 * In-page title block of an inner screen (record or form title, subtitle, actions). The top bar
 * only carries the back button there (PageHeader with backTo). F-16 FormLayout and F-17
 * RecordHeader replace this block screen by screen.
 */
export default function PageTitle({ title, subtitle, actions, className = '' }) {
    return (
        <div className={`mb-4 flex flex-wrap items-start justify-between gap-3 ${className}`}>
            <div className="min-w-0">
                <h1 className="text-xl font-semibold tracking-tight text-ink md:text-2xl">{title}</h1>
                {subtitle && <p className="mt-0.5 text-sm text-ink-muted">{subtitle}</p>}
            </div>
            {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </div>
    );
}
