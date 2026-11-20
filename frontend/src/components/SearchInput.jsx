import Icon from './Icon.jsx';

/** Search box with a clear button. Filtering happens on the device (see useListFilter). */
export default function SearchInput({ value, onChange, placeholder = 'Search', className = '', label }) {
    return (
        <div className={`relative ${className}`}>
            <Icon name="search" className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-ink-muted" />
            <input
                type="search"
                value={value}
                onChange={(e) => onChange(e.target.value)}
                placeholder={placeholder}
                aria-label={label || placeholder}
                className="min-h-11 w-full rounded-control border border-line bg-surface pr-11 pl-9 text-base text-ink placeholder:text-ink-muted/80 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/25 focus:outline-none [&::-webkit-search-cancel-button]:hidden"
            />
            {value && (
                <button
                    type="button"
                    onClick={() => onChange('')}
                    aria-label="Clear search"
                    className="absolute top-1/2 right-1 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-control text-ink-muted hover:bg-page"
                >
                    <Icon name="close" className="h-4 w-4" />
                </button>
            )}
        </div>
    );
}
