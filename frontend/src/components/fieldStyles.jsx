/**
 * Shared classes for form controls (TextField, TextArea, SelectField, DateField, MoneyField).
 * Border line-strong (3:1 on white), solid 2 px focus ring in the accent; red border and ring on error.
 */
export const controlClass = (hasError) =>
    `w-full rounded-control border bg-surface px-3 text-base text-ink transition-colors placeholder:text-ink-subtle focus:outline-2 focus:outline-offset-1 disabled:border-line disabled:bg-surface-subtle disabled:text-ink-subtle ${
        hasError ? 'border-danger focus:border-danger focus:outline-danger' : 'border-line-strong hover:border-ink-subtle focus:border-accent focus:outline-accent'
    }`;

export function FieldLabel({ htmlFor, label, required }) {
    if (!label) return null;
    return (
        <label htmlFor={htmlFor} className="text-sm font-medium text-ink">
            {label}
            {required && (
                <span aria-hidden="true" className="text-ink-subtle">
                    {' '}
                    *
                </span>
            )}
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
