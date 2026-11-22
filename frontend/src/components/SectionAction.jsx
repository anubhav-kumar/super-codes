import Button from './Button.jsx';

/**
 * The one section-action style on detail screens ("Link person", "Raise invoice", "Add payment",
 * "Assign worker"): a small secondary button with a 16 px icon, placed right of the section title
 * (pass it as `action` to Section, RelatedSection or Card). The hit area grows to 44 px on phones.
 *   <SectionAction icon="plus" to="/invoices/new?orderId=…" disabled={!online}>Raise invoice</SectionAction>
 */
export default function SectionAction({ icon = 'plus', to, onClick, disabled = false, loading = false, className = '', children, ...rest }) {
    return (
        <Button
            variant="secondary"
            size="sm"
            icon={icon}
            to={to}
            onClick={onClick}
            disabled={disabled}
            loading={loading}
            className={`relative after:absolute after:inset-x-0 after:-inset-y-1.5 md:after:hidden ${className}`}
            {...rest}
        >
            {children}
        </Button>
    );
}
