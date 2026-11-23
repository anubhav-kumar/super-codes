import { useId, useLayoutEffect, useRef, useState } from 'react';
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
 * ("15,00,000"); on focus it shows the raw text ("1500000"). Every focus into the field (Tab,
 * programmatic, or the first click or tap) selects the whole raw value right after that rewrite is
 * committed, so typing replaces a prefilled amount instead of appending to it. The mouseup that
 * ends a focusing click would collapse that selection, so it is cancelled once. A click while the
 * field is already focused places the caret as usual.
 * The caret is never moved while typing and the value sent to onChange is never reformatted.
 *
 * `warning` shows a non-blocking message under the field (an `error` takes its place).
 */
export default function MoneyField({
    label,
    value,
    onChange,
    error,
    warning,
    hint,
    required = false,
    id,
    className = '',
    onFocus,
    onBlur,
    onPointerDown,
    onMouseUp,
    ...rest
}) {
    const autoId = useId();
    const fieldId = id || autoId;
    const messageId = `${fieldId}-msg`;
    const readbackId = `${fieldId}-readback`;
    const [focused, setFocused] = useState(false);
    const inputRef = useRef(null);
    const selectOnMouseUp = useRef(false);
    const pendingSelection = useRef(null);

    const text = value ?? '';
    const shown = focused ? text : groupMoneyInput(text);
    const amount = parseMoney(text);
    const valid = amount !== null && !Number.isNaN(amount);
    const words = valid ? formatLakh(amount) : '';
    const readback = valid ? (words ? `${formatMoney(amount)} · ${words}` : formatMoney(amount)) : '';
    const message = error ? null : warning;
    const describedBy = [readback && readbackId, (error || message || hint) && messageId].filter(Boolean).join(' ') || undefined;

    // Runs after the focus re-render has written the raw text into the input, before the next key.
    useLayoutEffect(() => {
        const sel = pendingSelection.current;
        pendingSelection.current = null;
        const input = inputRef.current;
        if (sel && input && document.activeElement === input) input.setSelectionRange(sel[0], sel[1]);
    });

    return (
        <div className={`flex flex-col gap-1.5 ${className}`}>
            <FieldLabel htmlFor={fieldId} label={label} required={required} />
            <div className="relative">
                <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-ink-muted">₹</span>
                <input
                    ref={inputRef}
                    id={fieldId}
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    value={shown}
                    onChange={(e) => onChange && onChange(e.target.value, e)}
                    onPointerDown={(e) => {
                        // A click on the already focused field places the caret normally.
                        selectOnMouseUp.current = false;
                        if (onPointerDown) onPointerDown(e);
                    }}
                    onFocus={(e) => {
                        pendingSelection.current = [0, text.length];
                        selectOnMouseUp.current = text.length > 0;
                        setFocused(true);
                        if (onFocus) onFocus(e);
                    }}
                    onMouseUp={(e) => {
                        if (selectOnMouseUp.current) {
                            selectOnMouseUp.current = false;
                            e.preventDefault();
                            e.currentTarget.setSelectionRange(0, e.currentTarget.value.length);
                        }
                        if (onMouseUp) onMouseUp(e);
                    }}
                    onBlur={(e) => {
                        selectOnMouseUp.current = false;
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
            {message ? (
                <p id={messageId} role="status" className="text-sm text-warning">
                    {message}
                </p>
            ) : (
                <FieldMessage id={messageId} error={error} hint={hint} />
            )}
        </div>
    );
}
