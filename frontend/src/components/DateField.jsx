import { useId } from 'react';
import { formatDateLong, relativeDays } from '../utils/dates.js';
import { controlClass, FieldLabel, FieldMessage } from './fieldStyles.jsx';

/**
 * Native date input with label and inline error. The value is a plain "YYYY-MM-DD" string
 * ('' when empty) and is never converted through Date, so time zones cannot shift the day.
 * Under the field the chosen date is read back in the app's display format ("Wed, 25 Nov 2026");
 * `relative` adds the distance from today ("· in 15 days", "· 3 days ago"), for due dates.
 */
export default function DateField({ label, value, onChange, error, hint, required = false, relative = false, id, className = '', ...rest }) {
    const autoId = useId();
    const fieldId = id || autoId;
    const messageId = `${fieldId}-msg`;
    const readbackId = `${fieldId}-readback`;
    const long = formatDateLong(value);
    const readback = long && relative ? `${long} · ${relativeDays(value)}` : long;
    const describedBy = [readback && readbackId, (error || hint) && messageId].filter(Boolean).join(' ') || undefined;
    return (
        <div className={`flex flex-col gap-1.5 ${className}`}>
            <FieldLabel htmlFor={fieldId} label={label} required={required} />
            <input
                id={fieldId}
                type="date"
                value={value ?? ''}
                onChange={(e) => onChange && onChange(e.target.value, e)}
                aria-invalid={error ? 'true' : undefined}
                aria-describedby={describedBy}
                className={`min-h-11 ${controlClass(Boolean(error))}`}
                {...rest}
            />
            {readback && (
                <p id={readbackId} className="text-sm text-ink-muted tabular-nums">
                    {readback}
                </p>
            )}
            <FieldMessage id={messageId} error={error} hint={hint} />
        </div>
    );
}
