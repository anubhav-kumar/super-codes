/** Label/value pair for detail screens. Shows "Not set" in muted text when empty. */
export default function DetailField({ label, value, children, className = '' }) {
    const content = children ?? value;
    const empty = content === null || content === undefined || content === '';
    return (
        <div className={`flex flex-col gap-0.5 ${className}`}>
            <dt className="text-sm text-ink-muted">{label}</dt>
            <dd className={empty ? 'text-ink-muted italic' : 'break-words text-ink'}>{empty ? 'Not set' : content}</dd>
        </div>
    );
}
