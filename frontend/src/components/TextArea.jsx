import { useId } from 'react';
import { controlClass, FieldLabel, FieldMessage } from './fieldStyles.jsx';

/** Multi-line field (address, notes, description). onChange receives the new string value. */
export default function TextArea({ label, value, onChange, error, hint, required = false, id, rows = 3, className = '', ...rest }) {
    const autoId = useId();
    const fieldId = id || autoId;
    const messageId = `${fieldId}-msg`;
    return (
        <div className={`flex flex-col gap-1.5 ${className}`}>
            <FieldLabel htmlFor={fieldId} label={label} required={required} />
            <textarea
                id={fieldId}
                rows={rows}
                value={value ?? ''}
                onChange={(e) => onChange && onChange(e.target.value, e)}
                aria-invalid={error ? 'true' : undefined}
                aria-describedby={error || hint ? messageId : undefined}
                className={`py-2.5 ${controlClass(Boolean(error))}`}
                {...rest}
            />
            <FieldMessage id={messageId} error={error} hint={hint} />
        </div>
    );
}
