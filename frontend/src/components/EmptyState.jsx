import Button from './Button.jsx';
import Icon from './Icon.jsx';

/**
 * Icon, title, text and an optional action (empty list, no results, unavailable offline, errors).
 * action: { label, onClick } or { label, to }.
 */
export default function EmptyState({ icon = 'alert', title, text, action, compact = false, className = '' }) {
    return (
        <div className={`flex flex-col items-center text-center ${compact ? 'gap-2 py-6' : 'gap-3 px-4 py-12'} ${className}`}>
            {icon && (
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-muted text-ink-subtle">
                    <Icon name={icon} className="h-6 w-6" />
                </span>
            )}
            {title && <h2 className="text-base font-semibold text-ink">{title}</h2>}
            {text && <p className="max-w-sm text-sm text-ink-muted">{text}</p>}
            {action && (
                <Button variant="secondary" to={action.to} onClick={action.onClick} icon={action.icon} className="mt-1">
                    {action.label}
                </Button>
            )}
        </div>
    );
}
