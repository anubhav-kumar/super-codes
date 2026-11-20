import { useId } from 'react';
import { controlClass, FieldLabel, FieldMessage } from './fieldStyles.jsx';

/**
 * Labelled input with hint and inline error.
 * onChange receives the new string value. `transform="uppercase"` uppercases as the user types.
 * `trailing` renders inside the right edge of the input (e.g. a show/hide button).
 */
export default function TextField({
    label,
    value,
    onChange,
    error,
    hint,
    required = false,
    transform,
    trailing,
    id,
    className = '',
    type = 'text',
    ...rest
}) {
    const autoId = useId();
    const fieldId = id || autoId;
    const messageId = `${fieldId}-msg`;
    const handleChange = (e) => {
        const v = transform === 'uppercase' ? e.target.value.toUpperCase() : e.target.value;
        if (onChange) onChange(v, e);
    };
    return (
        <div className={`flex flex-col gap-1.5 ${className}`}>
            <FieldLabel htmlFor={fieldId} label={label} required={required} />
            <div className="relative">
                <input
                    id={fieldId}
                    type={type}
                    value={value ?? ''}
                    onChange={handleChange}
                    aria-invalid={error ? 'true' : undefined}
                    aria-describedby={error || hint ? messageId : undefined}
                    className={`min-h-11 ${controlClass(Boolean(error))} ${trailing ? 'pr-12' : ''}`}
                    {...rest}
                />
                {trailing && <div className="absolute inset-y-0 right-0 flex items-center pr-1">{trailing}</div>}
            </div>
            <FieldMessage id={messageId} error={error} hint={hint} />
        </div>
    );
}
