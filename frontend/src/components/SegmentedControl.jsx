/**
 * Two to six options as chips (People/Companies switch, status filters).
 * options: [{ value, label }]. Scrolls horizontally on small screens.
 */
export default function SegmentedControl({ options, value, onChange, label, className = '' }) {
    return (
        <div role="radiogroup" aria-label={label} className={`-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0 ${className}`}>
            {options.map((o) => {
                const active = o.value === value;
                return (
                    <button
                        key={o.value}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        onClick={() => onChange(o.value)}
                        className={`min-h-9 shrink-0 rounded-full px-4 text-sm font-medium whitespace-nowrap ring-1 transition ring-inset focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                            active ? 'bg-accent text-on-accent ring-accent' : 'bg-surface text-ink ring-line hover:bg-surface-subtle'
                        }`}
                    >
                        {o.label}
                    </button>
                );
            })}
        </div>
    );
}
