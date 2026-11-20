import { useId } from 'react';
import { controlClass, FieldLabel, FieldMessage } from './fieldStyles.jsx';

/**
 * Native <select> with label and error.
 * options: [{ value, label }]. `placeholder` adds an empty first option. onChange receives the value.
 */
export default function SelectField({
    label,
    value,
    onChange,
    options = [],
    placeholder,
    error,
    hint,
    required = false,
    id,
    className = '',
    ...rest
}) {
    const autoId = useId();
    const fieldId = id || autoId;
    const messageId = `${fieldId}-msg`;
    return (
        <div className={`flex flex-col gap-1.5 ${className}`}>
            <FieldLabel htmlFor={fieldId} label={label} required={required} />
            <select
                id={fieldId}
                value={value ?? ''}
                onChange={(e) => onChange && onChange(e.target.value, e)}
                aria-invalid={error ? 'true' : undefined}
                aria-describedby={error || hint ? messageId : undefined}
                className={`min-h-11 ${controlClass(Boolean(error))}`}
                {...rest}
            >
                {placeholder !== undefined && <option value="">{placeholder}</option>}
                {options.map((o) => (
                    <option key={o.value} value={o.value}>
                        {o.label}
                    </option>
                ))}
            </select>
            <FieldMessage id={messageId} error={error} hint={hint} />
        </div>
    );
}
