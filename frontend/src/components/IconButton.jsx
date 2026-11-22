import { Link } from 'react-router-dom';
import useMediaQuery from '../hooks/useMediaQuery.js';
import Icon from './Icon.jsx';
import Tooltip from './Tooltip.jsx';

/**
 * Icon-only button: 44 px on phones, 36 px on md+. `label` is required: it is the accessible
 * name and, on md+, the tooltip. Renders a router Link when `to` is given.
 */
export default function IconButton({ label, icon, to, tooltipSide = 'bottom', className = '', type = 'button', ...rest }) {
    const desktop = useMediaQuery('(min-width: 768px)');
    const classes = `inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-control text-ink transition hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:text-ink-subtle md:h-9 md:w-9 ${className}`;
    const control = to ? (
        <Link to={to} aria-label={label} className={classes} {...rest}>
            <Icon name={icon} />
        </Link>
    ) : (
        <button type={type} aria-label={label} className={classes} {...rest}>
            <Icon name={icon} />
        </button>
    );
    return (
        <Tooltip label={label} side={tooltipSide} disabled={!desktop} describe={false}>
            {control}
        </Tooltip>
    );
}
