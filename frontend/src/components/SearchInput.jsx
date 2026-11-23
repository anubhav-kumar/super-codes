import Icon from './Icon.jsx';

/**
 * Search box with a clear button. Filtering happens on the device (see useListFilter).
 * `placeholder` is the short visible hint; `label` is the full accessible name (falls back to the placeholder).
 * The right padding leaves room for the clear button only while there is a value, so the hint gets the width.
 */
export default function SearchInput({ value, onChange, placeholder = 'Search', className = '', label, autoFocus = false }) {
    return (
        <div className={`relative ${className}`}>
            <Icon name="search" size="sm" className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-subtle" />
            <input
                type="search"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder={placeholder}
                aria-label={label || placeholder}
                autoFocus={autoFocus}
                className={`min-h-11 w-full ${value ? 'pr-11' : 'pr-3'} rounded-control border border-line-strong bg-surface pl-9 text-base text-ink transition-colors placeholder:text-ink-subtle hover:border-ink-subtle focus:border-accent focus:outline-2 focus:outline-offset-1 focus:outline-accent [&::-webkit-search-cancel-button]:hidden`}
            />
            {value && (
                <button
                    type="button"
                    onClick={() => onChange('')}
                    aria-label="Clear search"
                    className="absolute top-1/2 right-1 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-control text-ink-subtle hover:bg-surface-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-accent"
                >
                    <Icon name="close" size="sm" />
                </button>
            )}
        </div>
    );
}
