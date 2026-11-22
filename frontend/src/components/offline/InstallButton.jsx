import useInstallPrompt from '../../hooks/useInstallPrompt.js';
import Icon from '../Icon.jsx';

/**
 * In-app "Install app" button. Hidden when not installable or already running standalone.
 * variant "button" (default) or "menu" (a row inside the account menu).
 */
export default function InstallButton({ className = '', variant = 'button', onInstalled }) {
    const { canInstall, promptInstall } = useInstallPrompt();
    if (!canInstall) return null;
    const handleClick = async () => {
        await promptInstall();
        if (onInstalled) onInstalled();
    };
    const classes =
        variant === 'menu'
            ? 'flex min-h-11 w-full items-center gap-3 px-4 text-left text-sm text-ink hover:bg-surface-subtle'
            : 'inline-flex min-h-11 items-center gap-2 rounded-control border border-line bg-surface px-4 text-sm font-medium text-ink shadow-raised hover:bg-surface-subtle';
    return (
        <button type="button" onClick={handleClick} className={`${classes} ${className}`}>
            <Icon name="download" className="h-4 w-4 text-ink-subtle" />
            Install app
        </button>
    );
}
