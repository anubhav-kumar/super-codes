import { useId } from 'react';

/**
 * One group of a form (F-16): hairline section with a heading and an optional one-line description.
 * Fields stack in one column; wrap short fields in <FormRow> to put two side by side from sm.
 */
export default function FormSection({ title, description, action, children, className = '' }) {
    const headingId = useId();
    return (
        <section aria-labelledby={title ? headingId : undefined} className={`rounded-card border border-line bg-surface p-4 md:p-5 ${className}`}>
            {(title || action) && (
                <div className="mb-4 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        {title && (
                            <h2 id={headingId} className="text-sm font-semibold text-ink">
                                {title}
                            </h2>
                        )}
                        {description && <p className="mt-0.5 text-sm text-ink-muted">{description}</p>}
                    </div>
                    {action}
                </div>
            )}
            <div className="flex flex-col gap-4">{children}</div>
        </section>
    );
}

/** Two short fields side by side from sm (one column on phones). */
export function FormRow({ children, className = '' }) {
    return <div className={`grid gap-4 sm:grid-cols-2 ${className}`}>{children}</div>;
}
