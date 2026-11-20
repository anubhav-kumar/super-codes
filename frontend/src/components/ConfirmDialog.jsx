import { useEffect, useId, useRef } from 'react';
import Button from './Button.jsx';

/** Modal with title, text, Cancel and a confirm button. Escape or the backdrop cancels. */
export default function ConfirmDialog({
    open,
    title,
    text,
    confirmLabel = 'Confirm',
    cancelLabel = 'Cancel',
    tone = 'primary',
    busy = false,
    onConfirm,
    onCancel,
}) {
    const titleId = useId();
    const cancelRef = useRef(null);

    useEffect(() => {
        if (!open) return undefined;
        cancelRef.current?.focus();
        const onKey = (e) => {
            if (e.key === 'Escape' && !busy) onCancel();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open, busy, onCancel]);

    if (!open) return null;
    return (
        <div className="fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center">
            <button
                type="button"
                aria-label="Close"
                tabIndex={-1}
                onClick={busy ? undefined : onCancel}
                className="absolute inset-0 bg-ink/40"
            />
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                className="relative w-full max-w-sm rounded-card bg-surface p-5 shadow-xl"
            >
                <h2 id={titleId} className="text-lg font-semibold text-ink">
                    {title}
                </h2>
                {text && <p className="mt-2 text-sm text-ink-muted">{text}</p>}
                <div className="mt-5 flex justify-end gap-3">
                    <Button ref={cancelRef} variant="secondary" onClick={onCancel} disabled={busy}>
                        {cancelLabel}
                    </Button>
                    <Button variant={tone === 'danger' ? 'danger' : 'primary'} onClick={onConfirm} loading={busy}>
                        {confirmLabel}
                    </Button>
                </div>
            </div>
        </div>
    );
}
