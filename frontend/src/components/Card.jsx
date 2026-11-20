/** White rounded surface with an optional title and action. */
export default function Card({ title, action, children, className = '', as: Tag = 'section' }) {
    return (
        <Tag className={`rounded-card border border-line bg-surface p-4 ${className}`}>
            {(title || action) && (
                <div className="mb-3 flex items-center justify-between gap-3">
                    {title && <h2 className="text-base font-semibold text-ink">{title}</h2>}
                    {action}
                </div>
            )}
            <div className="flex flex-col gap-3">{children}</div>
        </Tag>
    );
}
