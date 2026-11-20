/** Shared classes for form controls (TextField, TextArea, SelectField). */
export const controlClass = (hasError) =>
    `w-full rounded-control border bg-surface px-3 text-base text-ink placeholder:text-ink-muted/70 focus:outline-none focus:ring-2 disabled:bg-page disabled:text-ink-muted ${
        hasError ? 'border-danger focus:ring-danger/30' : 'border-line focus:border-primary-500 focus:ring-primary-500/25'
    }`;

export function FieldLabel({ htmlFor, label, required }) {
    if (!label) return null;
    return (
        <label htmlFor={htmlFor} className="text-sm font-medium text-ink">
            {label}
            {required && <span className="text-danger"> *</span>}
        </label>
    );
}

export function FieldMessage({ id, error, hint }) {
    if (error) {
        return (
            <p id={id} className="text-sm text-danger">
                {error}
            </p>
        );
    }
    if (hint) {
        return (
            <p id={id} className="text-sm text-ink-muted">
                {hint}
            </p>
        );
    }
    return null;
}
