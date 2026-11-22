const TONES = {
    neutral: { pill: 'bg-surface-muted text-ink-muted ring-line', dot: 'bg-ink-subtle' },
    success: { pill: 'bg-success-bg text-success ring-success-line', dot: 'bg-success-dot' },
    warning: { pill: 'bg-warning-bg text-warning ring-warning-line', dot: 'bg-warning-dot' },
    danger: { pill: 'bg-danger-bg text-danger ring-danger-line', dot: 'bg-danger-dot' },
};
// Legacy tone: routine statuses used "info"; it now renders as neutral.
TONES.info = TONES.neutral;

/**
 * Status pill with a leading dot, so status never relies on color alone.
 * tone: neutral | success | warning | danger (info renders as neutral).
 * Quiet non-status labels use Tag instead.
 */
export default function Badge({ tone = 'neutral', children, className = '' }) {
    const t = TONES[tone] || TONES.neutral;
    return (
        <span
            className={`inline-flex h-5.5 items-center gap-1.5 rounded-full px-2 text-xs font-medium whitespace-nowrap ring-1 ring-inset ${t.pill} ${className}`}
        >
            <span aria-hidden="true" className={`h-1.5 w-1.5 shrink-0 rounded-full ${t.dot}`} />
            {children}
        </span>
    );
}
