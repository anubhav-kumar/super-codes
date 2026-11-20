const TONES = {
    neutral: 'bg-page text-ink-muted ring-line',
    info: 'bg-info-bg text-info ring-info/20',
    success: 'bg-success-bg text-success ring-success/20',
    warning: 'bg-warning-bg text-warning ring-warning/20',
    danger: 'bg-danger-bg text-danger ring-danger/20',
};

/** Small status pill. tone: neutral | info | success | warning | danger. */
export default function Badge({ tone = 'neutral', children, className = '' }) {
    return (
        <span
            className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset ${TONES[tone] || TONES.neutral} ${className}`}
        >
            {children}
        </span>
    );
}
