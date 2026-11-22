import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import IconButton from './IconButton.jsx';

const FOCUSABLE =
    'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Bottom sheet on phones, centered dialog on md+.
 *   <Sheet open={open} title="Choose client" onClose={close} footer={<Button>Done</Button>}>…</Sheet>
 * Focus moves into the sheet (first field or button, or `initialFocus`), Tab stays inside, Escape
 * and the backdrop close it, focus returns to the element that opened it. The page behind does not
 * scroll while it is open. `size` = 'md' (default, 512 px) or 'lg' (672 px) on md+.
 */
export default function Sheet({ open, title, onClose, footer, children, size = 'md', initialFocus, className = '' }) {
    const titleId = useId();
    const panelRef = useRef(null);
    const closeRef = useRef(onClose);
    closeRef.current = onClose;

    useEffect(() => {
        if (!open) return undefined;
        const opener = document.activeElement;
        const panel = panelRef.current;

        const first =
            (initialFocus && initialFocus.current) ||
            (panel && [...panel.querySelectorAll(FOCUSABLE)].find((el) => !el.dataset.sheetClose)) ||
            panel;
        first?.focus();

        const lockTargets = [document.body, document.querySelector('main')].filter(Boolean);
        const previous = lockTargets.map((el) => el.style.overflow);
        lockTargets.forEach((el) => {
            el.style.overflow = 'hidden';
        });

        const onKey = (e) => {
            if (e.key === 'Escape') {
                e.stopPropagation();
                closeRef.current?.();
                return;
            }
            if (e.key !== 'Tab' || !panel) return;
            const items = [...panel.querySelectorAll(FOCUSABLE)].filter((el) => el.offsetParent !== null);
            if (items.length === 0) {
                e.preventDefault();
                return;
            }
            const firstItem = items[0];
            const lastItem = items[items.length - 1];
            if (e.shiftKey && (document.activeElement === firstItem || !panel.contains(document.activeElement))) {
                e.preventDefault();
                lastItem.focus();
            } else if (!e.shiftKey && document.activeElement === lastItem) {
                e.preventDefault();
                firstItem.focus();
            }
        };
        document.addEventListener('keydown', onKey);

        return () => {
            document.removeEventListener('keydown', onKey);
            lockTargets.forEach((el, i) => {
                el.style.overflow = previous[i];
            });
            if (opener && typeof opener.focus === 'function' && document.contains(opener)) opener.focus();
        };
        // initialFocus is a ref; it is read once when the sheet opens.
    }, [open]);

    if (!open) return null;

    const width = size === 'lg' ? 'md:max-w-2xl' : 'md:max-w-lg';

    return createPortal(
        <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center md:p-6">
            <button type="button" aria-label="Close" tabIndex={-1} onClick={onClose} className="absolute inset-0 bg-ink/30" />
            <div
                ref={panelRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                tabIndex={-1}
                className={`relative flex max-h-[90dvh] w-full flex-col rounded-t-sheet border border-line bg-surface shadow-overlay outline-none md:max-h-[85dvh] md:rounded-sheet ${width} ${className}`}
            >
                <div aria-hidden="true" className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-line md:hidden" />
                <div className="flex shrink-0 items-center gap-2 py-2 pr-2 pl-4 md:py-3 md:pl-5">
                    <h2 id={titleId} className="min-w-0 flex-1 text-base font-semibold text-ink">
                        {title}
                    </h2>
                    <IconButton label="Close" icon="close" onClick={onClose} data-sheet-close="true" />
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4 md:px-5">{children}</div>
                {footer && (
                    <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-line px-4 py-3 md:px-5">{footer}</div>
                )}
                <div aria-hidden="true" className="h-[env(safe-area-inset-bottom)] shrink-0 md:hidden" />
            </div>
        </div>,
        document.body
    );
}
