import { useId } from 'react';
import { controlClass, FieldLabel, FieldMessage } from './fieldStyles.jsx';

/**
 * Native date input with label and inline error. The value is a plain "YYYY-MM-DD" string
 * ('' when empty) and is never converted through Date, so time zones cannot shift the day.
 */
export default function DateField({ label, value, onChange, error, hint, required = false, id, className = '', ...rest }) {
    const autoId = useId();
    const fieldId = id || autoId;
    const messageId = `${fieldId}-msg`;
    return (
        <div className={`flex flex-col gap-1.5 ${className}`}>
            <FieldLabel htmlFor={fieldId} label={label} required={required} />
            <input
                id={fieldId}
                type="date"
                value={value ?? ''}
                onChange={(e) => onChange && onChange(e.target.value, e)}
                aria-invalid={error ? 'true' : undefined}
                aria-describedby={error || hint ? messageId : undefined}
                className={`min-h-11 ${controlClass(Boolean(error))}`}
                {...rest}
            />
            <FieldMessage id={messageId} error={error} hint={hint} />
        </div>
    );
}
