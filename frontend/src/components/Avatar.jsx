const SIZES = { md: 'h-8 w-8', sm: 'h-6 w-6 text-[10px]' };

/** Up to two initials: "Asha Rao" -> "AR", "asha" -> "A". */
function initials(name) {
    const words = String(name || '')
        .trim()
        .split(/\s+/)
        .filter(Boolean);
    if (words.length === 0) return '?';
    const first = words[0][0];
    const last = words.length > 1 ? words[words.length - 1][0] : '';
    return `${first}${last}`.toUpperCase();
}

/**
 * Initials circle (32 px, 24 px with size="sm"). Never colored per person. Decorative: the name is
 * always shown next to it.
 */
export default function Avatar({ name, size = 'md', className = '' }) {
    return (
        <span
            aria-hidden="true"
            className={`inline-flex shrink-0 items-center justify-center rounded-full bg-surface-muted text-xs font-semibold text-ink-muted select-none ${SIZES[size] || SIZES.md} ${className}`}
        >
            {initials(name)}
        </span>
    );
}
