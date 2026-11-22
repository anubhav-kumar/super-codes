import { useId, useLayoutEffect, useRef, useState } from 'react';
import { formatLakh, formatMoney, groupMoneyInput } from '../utils/format.js';
import { parseMoney } from '../utils/validation.js';
import { controlClass, FieldLabel, FieldMessage } from './fieldStyles.jsx';

const isAmountChar = (ch) => !/[,\s₹]/.test(ch);

/**
 * Position in `raw` that matches `pos` in `shown` (its grouped form), by counting the characters
 * other than commas, spaces and "₹" before it: "5,0|00" -> "50|00".
 */
export function rawCaret(shown, raw, pos) {
    let count = 0;
    for (let i = 0; i < pos && i < shown.length; i += 1) if (isAmountChar(shown[i])) count += 1;
    let i = 0;
    while (i < raw.length && count > 0) {
        if (isAmountChar(raw[i])) count -= 1;
        i += 1;
    }
    return i;
}

/**
 * Where the selection goes after the focus rewrite from the grouped text to the raw text. A full
 * selection (select all, Playwright fill, a browser's select-on-Tab) and any focus that did not
 * come from a pointer (Tab, programmatic) select the whole raw value, so typing replaces it. A
 * click keeps its caret at the same digit.
 */
export function selectionAfterFocus(shown, raw, start, end, fromPointer) {
    const all = start === 0 && end === shown.length && shown.length > 0;
    if (all || !fromPointer) return [0, raw.length];
    return [rawCaret(shown, raw, start), rawCaret(shown, raw, end)];
}

/**
 * INR amount input with a ₹ prefix. type="text" + inputMode="decimal" (not type="number", which
 * changes on scroll and depends on locale). The value stays the typed string; parse it with
 * parseMoney() from utils/validation.js when saving (number with 2 decimals, null when empty).
 *
 * While typing, the amount is read back under the field with Indian grouping and words from 1 lakh
 * up ("₹15,00,000.00 · 15 lakh"). Out of focus the input text itself shows the grouping
 * ("15,00,000"); on focus it shows the raw text ("1500000"). Rewriting the value on focus would
 * reset the browser's selection, so the selection is restored right after the rewrite is committed
 * (selectionAfterFocus): select all + type replaces the value instead of appending to it.
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
    ...rest
}) {
    const autoId = useId();
    const fieldId = id || autoId;
    const messageId = `${fieldId}-msg`;
    const readbackId = `${fieldId}-readback`;
    const [focused, setFocused] = useState(false);
    const inputRef = useRef(null);
    const pointerDown = useRef(false);
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
                        pointerDown.current = true;
                        if (onPointerDown) onPointerDown(e);
                    }}
                    onFocus={(e) => {
                        const input = e.target;
                        const fromPointer = pointerDown.current;
                        pointerDown.current = false;
                        if (input.value !== text) {
                            pendingSelection.current = selectionAfterFocus(input.value, text, input.selectionStart ?? 0, input.selectionEnd ?? 0, fromPointer);
                        }
                        setFocused(true);
                        if (onFocus) onFocus(e);
                    }}
                    onBlur={(e) => {
                        pointerDown.current = false;
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
