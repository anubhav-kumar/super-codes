import { useRef } from 'react';

/**
 * Two to ten options as chips (People/Companies switch, status filters), one selected.
 * options: [{ value, label, count, tone }]. `count` shows after the label; `tone: 'danger'` adds a
 * red dot while its count is above 0 (e.g. Overdue). Keyboard: one Tab stop, arrow keys / Home / End
 * move and select. Scrolls sideways on small screens.
 */
export default function SegmentedControl({ options, value, onChange, label, className = '', bleed = true }) {
    const refs = useRef([]);
    // bleed: on phones the chip row runs to the screen edges (off inside the top bar).
    const edge = bleed ? '-mx-4 px-4 sm:mx-0 sm:px-0' : '';
    const selectedIndex = Math.max(
        0,
        options.findIndex((o) => o.value === value)
    );

    const moveTo = (index) => {
        const i = (index + options.length) % options.length;
        refs.current[i]?.focus();
        onChange(options[i].value);
    };

    const onKeyDown = (e, i) => {
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
            e.preventDefault();
            moveTo(i + 1);
        } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
            e.preventDefault();
            moveTo(i - 1);
        } else if (e.key === 'Home') {
            e.preventDefault();
            moveTo(0);
        } else if (e.key === 'End') {
            e.preventDefault();
            moveTo(options.length - 1);
        }
    };

    return (
        <div role="radiogroup" aria-label={label} className={`flex gap-2 overflow-x-auto pb-1 ${edge} ${className}`}>
            {options.map((o, i) => {
                const active = o.value === value;
                const hasCount = o.count !== undefined && o.count !== null;
                const alert = o.tone === 'danger' && Number(o.count) > 0;
                return (
                    <button
                        key={o.value}
                        ref={(el) => {
                            refs.current[i] = el;
                        }}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        tabIndex={i === selectedIndex ? 0 : -1}
                        onClick={() => onChange(o.value)}
                        onKeyDown={(e) => onKeyDown(e, i)}
                        className={`inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full px-4 text-sm font-medium whitespace-nowrap ring-1 transition ring-inset focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                            active ? 'bg-accent text-on-accent ring-accent' : 'bg-surface text-ink ring-line hover:bg-surface-subtle'
                        }`}
                    >
                        {alert && <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-danger-dot" />}
                        {o.label}
                        {hasCount && <span className={`tabular-nums ${active ? 'text-on-accent/75' : 'text-ink-subtle'}`}>{o.count}</span>}
                    </button>
                );
            })}
        </div>
    );
}
