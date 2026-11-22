/** Quiet label that is not a status ("Individual client", "Primary owner", entity type): no fill, no dot. */
export default function Tag({ children, className = '' }) {
    return <span className={`text-xs font-medium whitespace-nowrap text-ink-subtle ${className}`}>{children}</span>;
}
