import { ORDER_STATUSES, ORDER_STATUS_TONE, orderStatusLabel } from '../../constants/orders.js';
import Badge from '../Badge.jsx';
import Icon from '../Icon.jsx';
import Menu from '../Menu.jsx';

const TRIGGER =
    'inline-flex min-h-11 items-center rounded-full transition hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-60 md:min-h-8';

/**
 * Order status as a badge-styled button with a chevron; opens a menu (a sheet on phones) of the six
 * statuses with the current one checked. The parent owns the value (useInlineSave), so the badge
 * shows the new status as soon as one is chosen; `saving` shows a spinner in place of the chevron.
 *   <StatusControl value={status.value} saving={status.saving} disabled={!online} onChange={change} />
 */
export default function StatusControl({ value, saving = false, disabled = false, onChange }) {
    const label = orderStatusLabel(value);
    return (
        <Menu
            label={saving ? `Status: ${label}. Saving` : `Status: ${label}. Change status`}
            sheetOnPhone
            sheetTitle="Change status"
            align="start"
            disabled={disabled || saving}
            triggerClassName={TRIGGER}
            trigger={
                <span title={disabled ? 'Connect to the internet to change the status' : undefined}>
                    <Badge tone={ORDER_STATUS_TONE[value]}>
                        {label}
                        {saving ? (
                            <span aria-hidden="true" className="h-3 w-3 animate-spin rounded-full border-2 border-current border-r-transparent" />
                        ) : (
                            <Icon name="chevron-down" size="sm" className="-mr-0.5" />
                        )}
                    </Badge>
                </span>
            }
            items={ORDER_STATUSES.map((s) => ({
                label: s.label,
                checked: s.value === value,
                onSelect: () => onChange(s.value),
            }))}
        />
    );
}
