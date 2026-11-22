import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import Icon from './Icon.jsx';
import ToastContext from './ToastContext.js';

const MAX_TOASTS = 3;
const DURATION = 5000;
const DURATION_WITH_ACTION = 8000;

const KIND_ICON = {
    success: { name: 'success', className: 'text-success-line' },
    error: { name: 'alert', className: 'text-danger-line' },
    info: { name: 'info', className: 'text-white/70' },
};

const FOCUS_RING = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white';

function ToastCard({ toast, onClose }) {
    const [hovered, setHovered] = useState(false);
    const [focused, setFocused] = useState(false);
    const remaining = useRef(toast.duration);
    const paused = hovered || focused;
    const icon = KIND_ICON[toast.kind] || KIND_ICON.info;

    // Auto-dismiss; hover and focus pause the countdown and resume it with the time left.
    useEffect(() => {
        if (!toast.duration || paused) return undefined;
        const started = Date.now();
        const timer = setTimeout(() => onClose(toast.id), remaining.current);
        return () => {
            clearTimeout(timer);
            remaining.current = Math.max(1000, remaining.current - (Date.now() - started));
        };
    }, [paused, toast.duration, toast.id, onClose]);

    return (
        <div
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            onFocus={() => setFocused(true)}
            onBlur={(e) => !e.currentTarget.contains(e.relatedTarget) && setFocused(false)}
            className="pointer-events-auto flex w-full items-start gap-3 rounded-card bg-ink py-3 pr-2 pl-4 text-white shadow-overlay"
        >
            <Icon name={icon.name} className={`mt-0.5 shrink-0 ${icon.className}`} />
            <p className="min-w-0 flex-1 py-0.5 text-sm break-words">{toast.message}</p>
            {toast.action && toast.action.to && (
                <Link
                    to={toast.action.to}
                    onClick={() => onClose(toast.id)}
                    className={`flex min-h-8 shrink-0 items-center rounded-control px-2 text-sm font-semibold whitespace-nowrap text-white underline-offset-2 hover:underline ${FOCUS_RING}`}
                >
                    {toast.action.label}
                </Link>
            )}
            <button
                type="button"
                onClick={() => onClose(toast.id)}
                aria-label="Dismiss"
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-control text-white/70 hover:bg-white/10 hover:text-white ${FOCUS_RING}`}
            >
                <Icon name="close" size="sm" />
            </button>
        </div>
    );
}

/**
 * Mounted once in App.jsx above <Routes>, so a toast raised just before navigate() survives the
 * route change. Up to 3 stacked toasts: bottom-center above the bottom nav on phones, bottom-right
 * on md+. Success and info toasts sit in a polite live region, errors in an assertive one.
 * Success/info auto-dismiss after 5 s (8 s with an action); errors stay until closed.
 */
export default function ToastProvider({ children }) {
    const [toasts, setToasts] = useState([]);
    const nextId = useRef(0);

    const dismiss = useCallback((id) => setToasts((list) => list.filter((t) => t.id !== id)), []);

    const show = useCallback((kind, message, options = {}) => {
        if (!message) return null;
        nextId.current += 1;
        const id = nextId.current;
        const action = options.action && options.action.label && options.action.to ? options.action : null;
        const duration = kind === 'error' ? 0 : action ? DURATION_WITH_ACTION : DURATION;
        setToasts((list) => [...list, { id, kind, message, action, duration }].slice(-MAX_TOASTS));
        return id;
    }, []);

    const api = useMemo(
        () => ({
            success: (message, options) => show('success', message, options),
            error: (message, options) => show('error', message, options),
            info: (message, options) => show('info', message, options),
            dismiss,
        }),
        [show, dismiss]
    );

    const polite = toasts.filter((t) => t.kind !== 'error');
    const assertive = toasts.filter((t) => t.kind === 'error');

    return (
        <ToastContext.Provider value={api}>
            {children}
            <div className="pointer-events-none fixed inset-x-4 bottom-[calc(4rem+env(safe-area-inset-bottom))] z-50 mx-auto flex max-w-md flex-col gap-2 md:inset-x-auto md:right-6 md:bottom-6 md:w-96 md:max-w-none">
                <div aria-live="assertive" className="flex flex-col gap-2">
                    {assertive.map((t) => (
                        <ToastCard key={t.id} toast={t} onClose={dismiss} />
                    ))}
                </div>
                <div aria-live="polite" role="status" className="flex flex-col gap-2">
                    {polite.map((t) => (
                        <ToastCard key={t.id} toast={t} onClose={dismiss} />
                    ))}
                </div>
            </div>
        </ToastContext.Provider>
    );
}
