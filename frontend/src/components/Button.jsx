import { Link } from 'react-router-dom';
import Icon from './Icon.jsx';

const VARIANTS = {
    primary: 'bg-primary-600 text-white hover:bg-primary-700 disabled:bg-primary-600/50',
    secondary: 'border border-line bg-surface text-ink hover:bg-page disabled:text-ink-muted',
    ghost: 'text-primary-700 hover:bg-primary-50 disabled:text-ink-muted',
    danger: 'bg-danger text-white hover:bg-danger/90 disabled:bg-danger/50',
};

const SIZES = {
    sm: 'min-h-9 px-3 text-sm',
    md: 'min-h-11 px-4 text-sm',
    lg: 'min-h-12 px-5 text-base',
};

/**
 * Button with variants (primary, secondary, ghost, danger), sizes (sm, md, lg) and a loading state.
 * Renders a router <Link> when `to` is given (and the button is not disabled).
 */
export default function Button({
    variant = 'primary',
    size = 'md',
    loading = false,
    disabled = false,
    to,
    icon,
    type = 'button',
    className = '',
    children,
    ...rest
}) {
    const classes = `inline-flex items-center justify-center gap-2 rounded-control font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-500 disabled:cursor-not-allowed ${VARIANTS[variant] || VARIANTS.primary} ${SIZES[size] || SIZES.md} ${className}`;
    const content = (
        <>
            {loading ? (
                <span aria-hidden="true" className="h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent" />
            ) : (
                icon && <Icon name={icon} className="h-4 w-4" />
            )}
            {children}
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
