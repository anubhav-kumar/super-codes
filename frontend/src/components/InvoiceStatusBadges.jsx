import { INVOICE_STATUS_TONE, invoiceStatusLabel, showsOverdueMarker } from '../constants/invoices.js';
import Badge from './Badge.jsx';

/** Displayed status badge of an invoice, plus a danger "Overdue" marker when partially paid and past due. */
export default function InvoiceStatusBadges({ invoice }) {
    return (
        <>
            <Badge tone={INVOICE_STATUS_TONE[invoice.displayedStatus]}>{invoiceStatusLabel(invoice.displayedStatus)}</Badge>
            {showsOverdueMarker(invoice) && <Badge tone="danger">Overdue</Badge>}
        </>
    );
}
