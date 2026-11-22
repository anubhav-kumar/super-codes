import { cloneElement, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const GAP = 8;

function placement(rect, side) {
    if (side === 'top') return { left: rect.left + rect.width / 2, top: rect.top - GAP, transform: 'translate(-50%, -100%)' };
    if (side === 'bottom') return { left: rect.left + rect.width / 2, top: rect.bottom + GAP, transform: 'translateX(-50%)' };
    return { left: rect.right + GAP, top: rect.top + rect.height / 2, transform: 'translateY(-50%)' };
}

function isFocusVisible(el) {
    try {
        return el.matches(':focus-visible');
    } catch {
        return true;
    }
}

/**
 * Text bubble next to one child element, shown on hover and on keyboard focus (focus-visible),
 * hidden on Escape. Rendered in a portal so a scrolling or clipped parent never cuts it off.
 * `disabled` keeps the same element tree (so focus is not lost when it toggles) but shows nothing.
 * `describe` links the bubble with aria-describedby; turn it off when the label equals the
 * child's accessible name.
 */
export default function Tooltip({ label, side = 'right', disabled = false, describe = true, className = '', children }) {
    const id = useId();
    const wrapRef = useRef(null);
    const [style, setStyle] = useState(null);
    const open = Boolean(style) && !disabled;

    const show = () => {
        if (disabled || !wrapRef.current) return;
        setStyle(placement(wrapRef.current.getBoundingClientRect(), side));
    };
    const hide = () => setStyle(null);

    useEffect(() => {
        if (!open) return undefined;
        const onKey = (e) => {
            if (e.key === 'Escape') setStyle(null);
        };
        document.addEventListener('keydown', onKey);
        window.addEventListener('scroll', hide, true);
        return () => {
            document.removeEventListener('keydown', onKey);
            window.removeEventListener('scroll', hide, true);
        };
    }, [open]);

    return (
        <span
            ref={wrapRef}
            className={className || 'inline-flex'}
            onMouseEnter={show}
            onMouseLeave={hide}
            onFocus={(e) => isFocusVisible(e.target) && show()}
            onBlur={hide}
        >
            {cloneElement(children, { 'aria-describedby': open && describe ? id : undefined })}
            {open &&
                createPortal(
                    <span
                        id={id}
                        role="tooltip"
                        style={{ position: 'fixed', ...style }}
                        className="pointer-events-none z-50 rounded-control bg-ink px-2 py-1 text-xs font-medium whitespace-nowrap text-white shadow-overlay"
                    >
                        {label}
                    </span>,
                    document.body
                )}
        </span>
    );
}
