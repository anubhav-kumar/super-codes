/**
 * Label/value pair for detail screens. Renders nothing when the value is empty (no "Not set").
 * New code uses FactList.
 */
export default function DetailField({ label, value, children, className = '' }) {
    const content = children ?? value;
    if (content === null || content === undefined || content === '' || content === false) return null;
    return (
        <div className={`flex flex-col gap-0.5 ${className}`}>
            <dt className="text-sm text-ink-muted">{label}</dt>
            <dd className="break-words text-ink">{content}</dd>
        </div>
    );
}
