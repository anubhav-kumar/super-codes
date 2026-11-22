/**
 * Detail-screen section: white block with a hairline edge (no shadow), header with title, count
 * and one `action` (a SectionAction) on the right, then the content and an optional `footer`
 * (e.g. "Show completed (3)"). `id` makes it a link target (#orders); the anchor clears the top bar.
 * `flush` (default true) lets lists run edge to edge under a hairline; set it to false for padded
 * content such as facts or text.
 */
export default function Section({ id, title, count, action, footer, children, flush = true, className = '' }) {
    const hasCount = count !== undefined && count !== null && count !== '';
    return (
        <section id={id} aria-label={typeof title === 'string' ? title : undefined} className={`scroll-mt-4 rounded-card border border-line bg-surface ${className}`}>
            {(title || action) && (
                <div className="flex min-h-14 items-center justify-between gap-3 px-4 py-2">
                    {title && (
                        <h2 className="min-w-0 text-sm font-semibold text-ink">
                            {title}
                            {hasCount && <span className="ml-2 font-normal text-ink-subtle tabular-nums">{count}</span>}
                        </h2>
                    )}
                    {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
                </div>
            )}
            {flush ? children : <div className="px-4 pb-4">{children}</div>}
            {footer && <div className="border-t border-line">{footer}</div>}
        </section>
    );
}
