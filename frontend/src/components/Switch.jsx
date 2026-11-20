import { useId } from 'react';

/** Yes/no toggle with a label. onChange receives the new boolean. */
export default function Switch({ label, checked = false, onChange, hint, disabled = false, id, className = '' }) {
    const autoId = useId();
    const fieldId = id || autoId;
    return (
        <div className={`flex items-start justify-between gap-4 ${className}`}>
            <div className="flex flex-col gap-0.5">
                <label htmlFor={fieldId} className="text-sm font-medium text-ink">
                    {label}
                </label>
                {hint && <p className="text-sm text-ink-muted">{hint}</p>}
            </div>
            <button
                id={fieldId}
                type="button"
                role="switch"
                aria-checked={checked}
                disabled={disabled}
                onClick={() => onChange && onChange(!checked)}
                className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500 disabled:opacity-50 ${
                    checked ? 'bg-primary-600' : 'bg-line'
                }`}
            >
                <span
                    className={`inline-block h-5 w-5 rounded-full bg-surface shadow transition ${checked ? 'translate-x-6' : 'translate-x-1'}`}
                />
            </button>
        </div>
    );
}
