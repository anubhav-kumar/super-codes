import { useEffect, useId, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from './Icon.jsx';

const ITEM_TONES = {
    default: 'text-ink hover:bg-surface-subtle focus-visible:bg-surface-subtle',
    danger: 'text-danger hover:bg-danger-bg focus-visible:bg-danger-bg',
};

/**
 * Accessible dropdown menu.
 *   <Menu label="Account" icon="account" header={...} items={[{ label, icon, onSelect, to, tone, disabled, hint }]} />
 * The trigger is an icon button (`icon`) or custom content (`trigger`); `label` is its accessible name.
 * Falsy items are skipped, so conditional items can be written inline.
 * Keyboard: Enter / Space / ArrowDown open on the first item, ArrowUp on the last; arrows move,
 * Home / End jump, Escape closes and returns focus to the trigger, Tab closes.
 * Closes on select and on a click outside. `align` = 'end' (default) or 'start'.
 */
export default function Menu({ label, icon, trigger, header, items, align = 'end', triggerClassName = '', className = '' }) {
    const navigate = useNavigate();
    const menuId = useId();
    const triggerId = useId();
    const rootRef = useRef(null);
    const triggerRef = useRef(null);
    const itemRefs = useRef([]);
    const [open, setOpen] = useState(false);
    const [focusIndex, setFocusIndex] = useState(-1);

    const list = (items || []).filter(Boolean);
    const enabled = list.map((item, i) => (item.disabled ? -1 : i)).filter((i) => i >= 0);

    const close = (returnFocus = true) => {
        setOpen(false);
        setFocusIndex(-1);
        if (returnFocus) triggerRef.current?.focus();
    };

    const openAt = (where) => {
        setOpen(true);
        setFocusIndex(where === 'last' ? enabled[enabled.length - 1] ?? -1 : enabled[0] ?? -1);
    };

    useEffect(() => {
        if (open && focusIndex >= 0) itemRefs.current[focusIndex]?.focus();
    }, [open, focusIndex]);

    useEffect(() => {
        if (!open) return undefined;
        const onPointer = (e) => {
            if (rootRef.current && !rootRef.current.contains(e.target)) close(false);
        };
        document.addEventListener('mousedown', onPointer);
        document.addEventListener('touchstart', onPointer);
        return () => {
            document.removeEventListener('mousedown', onPointer);
            document.removeEventListener('touchstart', onPointer);
        };
    }, [open]);

    const move = (step) => {
        if (enabled.length === 0) return;
        const at = enabled.indexOf(focusIndex);
        const next = at === -1 ? 0 : (at + step + enabled.length) % enabled.length;
        setFocusIndex(enabled[next]);
    };

    const onTriggerKey = (e) => {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            openAt('first');
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            openAt('last');
        }
    };

    const onMenuKey = (e) => {
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            move(1);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            move(-1);
        } else if (e.key === 'Home') {
            e.preventDefault();
            setFocusIndex(enabled[0] ?? -1);
        } else if (e.key === 'End') {
            e.preventDefault();
            setFocusIndex(enabled[enabled.length - 1] ?? -1);
        } else if (e.key === 'Escape') {
            e.preventDefault();
            close();
        } else if (e.key === 'Tab') {
            close(false);
        }
    };

    const select = (item) => {
        if (item.disabled) return;
        close();
        if (item.onSelect) item.onSelect();
        else if (item.to) navigate(item.to);
    };

    const triggerClasses =
        triggerClassName ||
        'inline-flex h-11 w-11 items-center justify-center rounded-control text-ink transition hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent md:h-9 md:w-9';

    return (
        <div ref={rootRef} className={`relative ${className}`}>
            <button
                ref={triggerRef}
                id={triggerId}
                type="button"
                aria-haspopup="menu"
                aria-expanded={open}
                aria-controls={open ? menuId : undefined}
                aria-label={label}
                onClick={() => (open ? close() : openAt('first'))}
                onKeyDown={onTriggerKey}
                className={triggerClasses}
            >
                {trigger || <Icon name={icon} />}
            </button>
            {open && (
                <div
                    className={`absolute top-full z-50 mt-1 w-64 overflow-hidden rounded-card border border-line bg-surface py-1 shadow-overlay ${align === 'start' ? 'left-0' : 'right-0'}`}
                    onKeyDown={onMenuKey}
                >
                    {header}
                    <div id={menuId} role="menu" aria-labelledby={triggerId}>
                        {list.map((item, i) => (
                            <button
                                key={item.label}
                                ref={(el) => {
                                    itemRefs.current[i] = el;
                                }}
                                type="button"
                                role="menuitem"
                                tabIndex={focusIndex === i ? 0 : -1}
                                aria-disabled={item.disabled || undefined}
                                onClick={() => select(item)}
                                className={`flex min-h-11 w-full items-center gap-3 px-4 py-2 text-left text-sm outline-none focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent aria-disabled:cursor-not-allowed aria-disabled:text-ink-subtle ${ITEM_TONES[item.tone] || ITEM_TONES.default}`}
                            >
                                {item.icon && <Icon name={item.icon} size="sm" className={item.tone === 'danger' ? '' : 'text-ink-subtle'} />}
                                <span className="min-w-0 flex-1">
                                    <span className="block">{item.label}</span>
                                    {item.hint && <span className="block text-xs text-ink-subtle">{item.hint}</span>}
                                </span>
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
