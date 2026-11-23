import { useEffect, useRef, useState } from 'react';
import Button from '../Button.jsx';
import FormError from '../FormError.jsx';
import TextArea from '../TextArea.jsx';
import { updateOrderComment } from '../../api/orderTimeline.js';
import useOnlineStatus from '../../hooks/useOnlineStatus.js';
import useSubmit from '../../hooks/useSubmit.js';
import { COMMENT_MAX, COUNTER_FROM, fitHeight, numberFormat } from './CommentComposer.jsx';

/**
 * In-place editor for the signed-in user's own comment (F-61). Same limits as the comment box
 * (required, up to 5,000 characters after trim). Sends the text only; never a status, so a progress
 * update keeps its status line and the order status is untouched. Escape or "Cancel" closes without
 * saving; Ctrl/Cmd+Enter saves. Online only.
 *
 * onSaved(comment) after a successful save; onGone() when the comment no longer exists (404);
 * onCancel() to close.
 */
export default function CommentEditor({ orderId, entry, onSaved, onGone, onCancel }) {
    const { online } = useOnlineStatus();
    const { submit, submitting, formError, fieldErrors } = useSubmit();
    const [text, setText] = useState(entry.text || '');
    const [localError, setLocalError] = useState(null);
    const textRef = useRef(null);

    useEffect(() => {
        const el = textRef.current;
        if (!el) return;
        el.focus();
        el.setSelectionRange(el.value.length, el.value.length);
    }, []);

    useEffect(() => {
        fitHeight(textRef.current);
    }, [text]);

    async function save() {
        if (submitting || !online) return;
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
        if (trimmed === (entry.text || '').trim()) {
            onCancel();
            return;
        }
        const result = await submit(() => updateOrderComment(orderId, entry.id, { text: trimmed }));
        if (result.ok) {
            onSaved((result.data && result.data.comment) || null);
            return;
        }
        if (result.error && result.error.status === 404 && onGone) onGone();
    }

    function onKeyDown(e) {
        if (e.key === 'Escape' && !submitting) {
            e.preventDefault();
            e.stopPropagation();
            onCancel();
        } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            save();
        }
    }

    function onSubmit(e) {
        e.preventDefault();
        save();
    }

    const length = text.length;
    const textError = localError || fieldErrors.text;

    return (
        <form onSubmit={onSubmit} noValidate className="mt-1 flex flex-col gap-3">
            <TextArea
                ref={textRef}
                aria-label="Edit comment"
                rows={3}
                value={text}
                onChange={(value) => {
                    setText(value);
                    if (localError) setLocalError(null);
                }}
                onKeyDown={onKeyDown}
                error={textError}
                disabled={!online}
                className="[&_textarea]:resize-none"
            />
            {length >= COUNTER_FROM && (
                <p className={`-mt-2 text-right text-xs ${length > COMMENT_MAX ? 'text-danger' : 'text-ink-muted'}`}>
                    {numberFormat.format(length)} / {numberFormat.format(COMMENT_MAX)}
                </p>
            )}
            <FormError message={fieldErrors.text ? null : formError} />
            <div className="flex justify-end gap-3">
                <Button variant="secondary" onClick={onCancel} disabled={submitting}>
                    Cancel
                </Button>
                <Button type="submit" loading={submitting} disabled={!online}>
                    Save
                </Button>
            </div>
            {!online && <p className="text-sm text-ink-muted">Connect to the internet to save your edit.</p>}
        </form>
    );
}
