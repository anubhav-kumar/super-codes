import { useId, useState } from 'react';
import { formatLakh, formatMoney, groupMoneyInput } from '../utils/format.js';
import { parseMoney } from '../utils/validation.js';
import { controlClass, FieldLabel, FieldMessage } from './fieldStyles.jsx';

/**
 * INR amount input with a ₹ prefix. type="text" + inputMode="decimal" (not type="number", which
 * changes on scroll and depends on locale). The value stays the typed string; parse it with
 * parseMoney() from utils/validation.js when saving (number with 2 decimals, null when empty).
 *
 * While typing, the amount is read back under the field with Indian grouping and words from 1 lakh
 * up ("₹15,00,000.00 · 15 lakh"). Out of focus the input text itself shows the grouping
 * ("15,00,000"); the caret is never moved while typing and the value sent to onChange is never
 * reformatted.
 */
export default function MoneyField({ label, value, onChange, error, hint, required = false, id, className = '', onFocus, onBlur, ...rest }) {
    const autoId = useId();
    const fieldId = id || autoId;
    const messageId = `${fieldId}-msg`;
    const readbackId = `${fieldId}-readback`;
    const [focused, setFocused] = useState(false);

    const text = value ?? '';
    const amount = parseMoney(text);
    const valid = amount !== null && !Number.isNaN(amount);
    const words = valid ? formatLakh(amount) : '';
    const readback = valid ? (words ? `${formatMoney(amount)} · ${words}` : formatMoney(amount)) : '';
    const describedBy = [readback && readbackId, (error || hint) && messageId].filter(Boolean).join(' ') || undefined;

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
                    value={focused ? text : groupMoneyInput(text)}
                    onChange={(e) => onChange && onChange(e.target.value, e)}
                    onFocus={(e) => {
                        setFocused(true);
                        if (onFocus) onFocus(e);
                    }}
                    onBlur={(e) => {
                        setFocused(false);
                        if (onBlur) onBlur(e);
                    }}
                    aria-invalid={error ? 'true' : undefined}
                    aria-describedby={describedBy}
                    className={`min-h-11 pl-7 tabular-nums ${controlClass(Boolean(error))}`}
                    {...rest}
                />
            </div>
            {readback && (
                <p id={readbackId} className="text-sm text-ink-muted tabular-nums">
                    {readback}
                </p>
            )}
            <FieldMessage id={messageId} error={error} hint={hint} />
        </div>
    );
}
