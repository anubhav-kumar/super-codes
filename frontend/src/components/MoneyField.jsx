import { useId } from 'react';
import { controlClass, FieldLabel, FieldMessage } from './fieldStyles.jsx';

/**
 * INR amount input with a ₹ prefix. type="text" + inputMode="decimal" (not type="number", which
 * changes on scroll and depends on locale). The value stays the typed string; parse it with
 * parseMoney() from utils/validation.js when saving (number with 2 decimals, null when empty).
 */
export default function MoneyField({ label, value, onChange, error, hint, required = false, id, className = '', ...rest }) {
    const autoId = useId();
    const fieldId = id || autoId;
    const messageId = `${fieldId}-msg`;
    return (
        <div className={`flex flex-col gap-1.5 ${className}`}>
            <FieldLabel htmlFor={fieldId} label={label} required={required} />
            <div className="relative">
                <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-ink-muted">₹</span>
                <input
                    id={fieldId}
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    value={value ?? ''}
                    onChange={(e) => onChange && onChange(e.target.value, e)}
                    aria-invalid={error ? 'true' : undefined}
                    aria-describedby={error || hint ? messageId : undefined}
                    className={`min-h-11 pl-7 tabular-nums ${controlClass(Boolean(error))}`}
                    {...rest}
                />
            </div>
            <FieldMessage id={messageId} error={error} hint={hint} />
        </div>
    );
}
