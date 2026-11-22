/** Quiet record number (ORD-0003, INV-0002, PAY-0002): small, tabular, no monospace, no color. */
export default function RecordNo({ children, className = '' }) {
    if (!children) return null;
    return <span className={`text-xs font-medium whitespace-nowrap text-ink-subtle tabular-nums ${className}`}>{children}</span>;
}
