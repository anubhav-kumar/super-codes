import { Link } from 'react-router-dom';
import Icon from './Icon.jsx';

const VARIANTS = {
    primary: 'bg-accent text-on-accent hover:bg-accent-hover disabled:bg-accent/50',
    secondary:
        'border border-line bg-surface text-ink shadow-raised hover:bg-surface-subtle disabled:text-ink-subtle disabled:shadow-none',
    ghost: 'text-ink hover:bg-surface-muted disabled:text-ink-subtle',
    danger: 'bg-danger text-white hover:bg-danger-hover disabled:bg-danger/50',
    'danger-ghost': 'text-danger hover:bg-danger-bg disabled:text-danger/50',
};

const SIZES = {
    sm: 'min-h-8 px-3 text-sm',
    md: 'min-h-11 px-4 text-sm md:min-h-10',
    lg: 'min-h-12 px-5 text-base',
};

const ICON_ONLY_SIZES = {
    sm: 'h-8 w-8',
    md: 'h-11 w-11 md:h-10 md:w-10',
    lg: 'h-12 w-12',
};

/**
 * Button with variants (primary, secondary, ghost, danger, danger-ghost), sizes (sm: md+ toolbars
 * only, md, lg) and a loading state. Renders a router <Link> when `to` is given (and the button is
 * not disabled). `iconOnly` shows just the 16 px icon and requires an `aria-label`.
 */
export default function Button({
    variant = 'primary',
    size = 'md',
    loading = false,
    disabled = false,
    to,
    icon,
    iconOnly = false,
    type = 'button',
    className = '',
    children,
    ...rest
}) {
    const sizeClass = iconOnly ? ICON_ONLY_SIZES[size] || ICON_ONLY_SIZES.md : SIZES[size] || SIZES.md;
    const classes = `inline-flex shrink-0 items-center justify-center gap-2 rounded-control font-medium transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed ${VARIANTS[variant] || VARIANTS.primary} ${sizeClass} ${className}`;
    const content = (
        <>
            {loading ? (
                <span aria-hidden="true" className="h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent" />
            ) : (
                icon && <Icon name={icon} className="h-4 w-4" />
            )}
            {!iconOnly && children}
        </>
    );

    if (to && !disabled) {
        return (
            <Link to={to} className={classes} {...rest}>
                {content}
            </Link>
        );
    }
    return (
        <button type={type} disabled={disabled || loading} aria-busy={loading || undefined} className={classes} {...rest}>
            {content}
        </button>
    );
}
