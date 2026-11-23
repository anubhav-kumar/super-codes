import { useEffect, useRef, useState } from 'react';
import Button from '../Button.jsx';
import FormError from '../FormError.jsx';
import OfflineActionHint from '../OfflineActionHint.jsx';
import SelectField from '../SelectField.jsx';
import TextArea from '../TextArea.jsx';
import { postOrderComment } from '../../api/orderTimeline.js';
import { ORDER_STATUSES } from '../../constants/orders.js';
import useOnlineStatus from '../../hooks/useOnlineStatus.js';
import useSubmit from '../../hooks/useSubmit.js';

export const COMMENT_MAX = 5000;
export const COUNTER_FROM = 4500;
const MAX_ROWS = 8;
export const numberFormat = new Intl.NumberFormat('en-US');

/** Grow the text area with its content, from its `rows` up to MAX_ROWS, then scroll. */
export function fitHeight(el) {
    if (!el) return;
    const style = window.getComputedStyle(el);
    const px = (v) => parseFloat(v) || 0;
    const borders = px(style.borderTopWidth) + px(style.borderBottomWidth);
    const max = (px(style.lineHeight) || 24) * MAX_ROWS + px(style.paddingTop) + px(style.paddingBottom) + borders;
    el.style.height = 'auto';
    const wanted = el.scrollHeight + borders;
    el.style.height = `${Math.min(wanted, max)}px`;
    el.style.overflowY = wanted > max ? 'auto' : 'hidden';
}

/**
 * Comment box at the bottom of the timeline (F-60). Text (required, up to 5,000 characters) and an
 * optional new status: with a status the post is a progress update that also changes the order status.
 * Ctrl/Cmd+Enter posts. Online only. The text is kept on any failure; one client id per attempt,
 * reused when the same text and status are retried (the server treats it as the same comment).
 *
 * onPosted(data) receives { comment, statusEvent, order } after a successful post.
 * onOrderChanged() is called when the server reports the order status changed meanwhile.
 */
export default function CommentComposer({ order, onPosted, onOrderChanged }) {
    const { online } = useOnlineStatus();
    const { submit, submitting, formError, fieldErrors } = useSubmit();
    const [text, setText] = useState('');
    const [status, setStatus] = useState('');
    const [localError, setLocalError] = useState(null);
    const attempt = useRef(null);
    const textRef = useRef(null);

    const statusOptions = ORDER_STATUSES.filter((s) => s.value !== order.status);
    // The order may change under the box (header status control): drop a choice that is now current.
    useEffect(() => {
        if (status && status === order.status) setStatus('');
    }, [order.status, status]);

    useEffect(() => {
        fitHeight(textRef.current);
    }, [text]);

    const disabled = !online;
    const length = text.length;

    async function post() {
        if (submitting || disabled) return;
        const trimmed = text.trim();
        if (!trimmed) {
            setLocalError('Write a comment first');
            return;
        }
        if (trimmed.length > COMMENT_MAX) {
            setLocalError('Keep it under 5,000 characters');
            return;
        }
        setLocalError(null);
        const nextStatus = status || null;
        const same = attempt.current && attempt.current.text === trimmed && attempt.current.status === nextStatus;
        if (!same) attempt.current = { id: crypto.randomUUID(), text: trimmed, status: nextStatus };
        const { id } = attempt.current;

        const result = await submit(() => postOrderComment(order.id, { id, text: trimmed, status: nextStatus }));
        if (result.ok) {
            attempt.current = null;
            setText('');
            setStatus('');
            if (onPosted) onPosted(result.data || {});
            return;
        }
        const error = result.error;
        if (!error) return;
        // A taken or invalid id is not the user's to fix: the next attempt gets a new one.
        const idProblem = error.code === 'ID_CONFLICT' || (error.details || []).some((d) => d && d.field === 'id');
        if (idProblem) attempt.current = null;
        if (error.code === 'ORDER_CHANGED') {
            attempt.current = null;
            if (onOrderChanged) onOrderChanged();
        }
    }

    function onKeyDown(e) {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            post();
        }
    }

    function onSubmit(e) {
        e.preventDefault();
        post();
    }

    const textError = localError || fieldErrors.text;
    const counter =
        length >= COUNTER_FROM ? (
            <span className={length > COMMENT_MAX ? 'text-danger' : undefined}>
                {numberFormat.format(length)} / {numberFormat.format(COMMENT_MAX)}
            </span>
        ) : null;

    return (
        <form onSubmit={onSubmit} noValidate className="mt-4 flex flex-col gap-3 border-t border-line pt-4">
            <TextArea
                ref={textRef}
                aria-label="Comment"
                placeholder="Write a comment…"
                rows={3}
                value={text}
                onChange={(value) => {
                    setText(value);
                    if (localError) setLocalError(null);
                }}
                onKeyDown={onKeyDown}
                error={textError}
                disabled={disabled}
                className="[&_textarea]:resize-none"
            />
            {counter && <p className="-mt-2 text-right text-xs text-ink-muted">{counter}</p>}
            <FormError message={fieldErrors.text || fieldErrors.status ? null : formError} />
            <div className="flex items-start justify-between gap-3">
                <SelectField
                    aria-label="New status"
                    placeholder="Status: No change"
                    value={status}
                    onChange={setStatus}
                    options={statusOptions}
                    error={fieldErrors.status}
                    disabled={disabled}
                    className="min-w-0 flex-1 sm:max-w-60 sm:flex-none"
                />
                <Button type="submit" loading={submitting} disabled={disabled}>
                    {status ? 'Post update' : 'Post'}
                </Button>
            </div>
            {disabled && <OfflineActionHint text="Connect to the internet to comment." />}
        </form>
    );
}
