import { APP_NAME } from '../config.js';

// Square size, letter size and corner radius per mark size (px).
const SIZES = {
    24: 'h-6 w-6 text-[10px] rounded-[5px]',
    32: 'h-8 w-8 text-[13px] rounded-[7px]',
    40: 'h-10 w-10 text-base rounded-[9px]',
};

/** The "CA" monogram: graphite rounded square with white letters. Never used as a feature icon. */
export default function AppMark({ size = 32, withWordmark = false, className = '' }) {
    const mark = (
        <span
            aria-hidden={withWordmark ? 'true' : undefined}
            role={withWordmark ? undefined : 'img'}
            aria-label={withWordmark ? undefined : APP_NAME}
            className={`inline-flex shrink-0 select-none items-center justify-center bg-accent font-semibold leading-none tracking-[-0.02em] text-on-accent ${SIZES[size] || SIZES[32]}`}
        >
            CA
        </span>
    );
    if (!withWordmark) return <span className={`inline-flex ${className}`.trim()}>{mark}</span>;
    return (
        <span className={`inline-flex items-center gap-2.5 ${className}`.trim()}>
            {mark}
            <span className="truncate text-base font-semibold text-ink">{APP_NAME}</span>
        </span>
    );
}
