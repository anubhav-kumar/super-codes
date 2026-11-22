import Icon from './Icon.jsx';

/**
 * Person or company icon. size 'row' (default): 32 px circle for list rows and pickers;
 * 'header': 40 px circle for record headers; 'inline': bare 16 px icon next to text.
 * Decorative unless `label` is given (rows already say the name).
 */
export default function ClientIcon({ type, size = 'row', label, className = '' }) {
    const name = type === 'COMPANY' ? 'company' : 'person';
    if (size === 'inline') {
        return <Icon name={name} size="sm" title={label} className={`shrink-0 text-ink-subtle ${className}`} />;
    }
    const box = size === 'header' ? 'h-10 w-10' : 'h-8 w-8';
    return (
        <span className={`inline-flex ${box} shrink-0 items-center justify-center rounded-full bg-surface-muted text-ink-muted ${className}`}>
            <Icon name={name} size={size === 'header' ? 'md' : 'sm'} title={label} />
        </span>
    );
}
