import { useState } from 'react';
import { Link } from 'react-router-dom';
import useOnlineStatus from '../../hooks/useOnlineStatus.js';
import Icon from '../Icon.jsx';
import Menu from '../Menu.jsx';
import OfflineActionHint from '../OfflineActionHint.jsx';
import RecordPaymentSheet from './RecordPaymentSheet.jsx';

// Phones: 64 px icon-over-label tiles in 4 columns. md+: regular buttons with the icon on the left.
const BASE =
    'flex min-h-16 w-full flex-col items-center justify-center gap-1 rounded-control px-1 text-center text-xs font-medium transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed md:min-h-10 md:w-auto md:flex-row md:gap-2 md:px-4 md:text-sm lg:w-full';
const TONES = {
    primary: 'bg-accent text-on-accent hover:bg-accent-hover disabled:bg-accent/50',
    secondary: 'border border-line bg-surface text-ink shadow-raised hover:bg-surface-subtle disabled:text-ink-subtle disabled:shadow-none',
};
const tile = (tone) => `${BASE} ${TONES[tone]}`;

function TileContent({ icon, label }) {
    return (
        <>
            <Icon name={icon} className="shrink-0 md:h-4 md:w-4" />
            <span className="leading-tight">{label}</span>
        </>
    );
}

/** A link while online; a disabled button offline (writes need a connection). */
function ActionLink({ to, icon, label, tone = 'secondary', disabled }) {
    if (disabled) {
        return (
            <button type="button" disabled className={tile(tone)}>
                <TileContent icon={icon} label={label} />
            </button>
        );
    }
    return (
        <Link to={to} className={tile(tone)}>
            <TileContent icon={icon} label={label} />
        </Link>
    );
}

/**
 * Home quick actions (F-21): New order (the only filled primary on Home), New invoice,
 * Record payment (sheet of open Issued invoices) and Add client (menu: person or company).
 * All need a connection, so they are disabled offline with the usual hint.
 */
export default function QuickActions({ className = '' }) {
    const { online } = useOnlineStatus();
    const [paymentOpen, setPaymentOpen] = useState(false);
    const offline = !online;

    return (
        <section aria-label="Quick actions" className={className}>
            <div className="grid grid-cols-4 gap-2 md:flex md:flex-wrap lg:grid lg:grid-cols-2">
                <ActionLink to="/orders/new" icon="orders" label="New order" tone="primary" disabled={offline} />
                <ActionLink to="/invoices/new" icon="raise-invoice" label="New invoice" disabled={offline} />
                <button type="button" disabled={offline} onClick={() => setPaymentOpen(true)} className={tile('secondary')}>
                    <TileContent icon="payment" label="Record payment" />
                </button>
                <Menu
                    label="Add client"
                    sheetOnPhone
                    sheetTitle="Add client"
                    disabled={offline}
                    className="flex"
                    triggerClassName={tile('secondary')}
                    trigger={<TileContent icon="add-person" label="Add client" />}
                    items={[
                        { label: 'Add person', icon: 'add-person', to: '/people/new' },
                        { label: 'Add company', icon: 'add-company', to: '/companies/new' },
                    ]}
                />
            </div>
            {offline && <OfflineActionHint className="mt-2" />}
            <RecordPaymentSheet open={paymentOpen} onClose={() => setPaymentOpen(false)} />
        </section>
    );
}
