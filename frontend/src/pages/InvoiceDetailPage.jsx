import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import Badge from '../components/Badge.jsx';
import Button from '../components/Button.jsx';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import DataView from '../components/DataView.jsx';
import DueLabel from '../components/DueLabel.jsx';
import FactList from '../components/FactList.jsx';
import Icon from '../components/Icon.jsx';
import InvoicePaymentsSection from '../components/InvoicePaymentsSection.jsx';
import MoneySummary from '../components/MoneySummary.jsx';
import OfflineActionHint from '../components/OfflineActionHint.jsx';
import PageBody from '../components/PageBody.jsx';
import PageHeader from '../components/PageHeader.jsx';
import RecordHeader from '../components/RecordHeader.jsx';
import RecordNo from '../components/RecordNo.jsx';
import Section from '../components/Section.jsx';
import { isInvoicePaid, isInvoiceSettled, lastPaidDate } from '../components/invoices/invoiceSettlement.js';
import { setInvoiceBaseStatus } from '../api/invoices.js';
import { INVOICE_STATUS_TONE, invoiceStatusLabel } from '../constants/invoices.js';
import { clientPath } from '../constants/orders.js';
import { useInvoice } from '../hooks/useInvoices.js';
import useOnlineStatus from '../hooks/useOnlineStatus.js';
import useRecordVisit from '../hooks/useRecordVisit.js';
import useRole from '../hooks/useRole.js';
import { useOrder } from '../hooks/useOrders.js';
import useSubmit from '../hooks/useSubmit.js';
import useToast from '../hooks/useToast.js';
import { isInvoiceOpen } from '../utils/due.js';
import { formatDate } from '../utils/format.js';

const linkClass = 'text-ink underline-offset-2 hover:underline focus-visible:underline';

/** Outstanding tone and hint from server-derived fields only (F-07); red only when overdue (F-25). */
function outstandingLook(invoice) {
    if (invoice.baseStatus === 'DRAFT') return { tone: 'neutral', hint: 'Nothing is due until the invoice is issued.' };
    if (invoice.baseStatus === 'CANCELLED') return { tone: 'neutral', hint: 'Cancelled invoices are not outstanding.' };
    return { tone: Number(invoice.outstanding) > 0 && invoice.isOverdue ? 'danger' : 'neutral' };
}

/** "ORD-0003 · GST Return Filing"; the service comes from the order (the invoice only carries its number). */
function useRelatedOrderLabel(order) {
    const orderId = order && order.id ? order.id : null;
    const loaded = useOrder(orderId);
    if (!orderId) return null;
    const service = loaded.data && loaded.data.serviceName;
    return [order.orderNumber || 'Order', service].filter(Boolean).join(' · ');
}

/**
 * Issue (Draft -> Issued) and Cancel from the header (F-25): a confirmation, then one PUT with the
 * invoice's current fields and the new base status, a toast and a reload of the invoice.
 */
function useStatusChange(invoice, reload) {
    const toast = useToast();
    const { submit, submitting } = useSubmit({ errorToast: true });
    const [confirm, setConfirm] = useState(null); // 'ISSUED' | 'CANCELLED' | null
    const number = invoice.invoiceNumber ? `Invoice ${invoice.invoiceNumber}` : 'Invoice';

    const run = async () => {
        const next = confirm;
        const result = await submit(() => setInvoiceBaseStatus(invoice, next));
        setConfirm(null);
        if (!result.ok) return;
        if (next === 'ISSUED') {
            toast.success(`${number} issued`, { action: { label: 'Record payment', to: `/invoices/${invoice.id}/payments/new` } });
        } else {
            toast.success(`${number} cancelled`);
        }
        if (reload) reload();
    };

    const dialog = (
        <ConfirmDialog
            open={confirm !== null}
            title={confirm === 'ISSUED' ? `Issue ${invoice.invoiceNumber || 'this invoice'}?` : 'Cancel this invoice?'}
            text={confirm === 'ISSUED' ? 'You can then record payments against it.' : 'It will no longer count as outstanding.'}
            confirmLabel={confirm === 'ISSUED' ? 'Issue invoice' : 'Cancel invoice'}
            cancelLabel={confirm === 'ISSUED' ? 'Not now' : 'Keep it'}
            tone={confirm === 'CANCELLED' ? 'danger' : 'primary'}
            busy={submitting}
            onConfirm={run}
            onCancel={() => setConfirm(null)}
        />
    );
    return { ask: setConfirm, submitting, dialog };
}

function InvoiceDetail({ invoice, reload }) {
    const { online } = useOnlineStatus();
    const { isAdmin } = useRole();
    // A member may see who an invoice is billed to without being able to open that client
    // (billedTo.canOpen === false): name as plain text. Missing canOpen counts as true.
    const toBilledTo = invoice.billedTo && invoice.billedTo.canOpen === false ? null : clientPath(invoice.billedTo);
    const billedToName = (invoice.billedTo && invoice.billedTo.name) || 'Unknown';
    const look = outstandingLook(invoice);
    const orderLabel = useRelatedOrderLabel(invoice.order);
    const status = useStatusChange(invoice, reload);
    const isDraft = invoice.baseStatus === 'DRAFT';
    const settled = isInvoiceSettled(invoice);
    const paidOn = isInvoicePaid(invoice) ? lastPaidDate(invoice) : null;
    const canRecordPayment = invoice.baseStatus === 'ISSUED' && !settled;
    const busy = !online || status.submitting;

    return (
        <>
            <RecordHeader
                eyebrow={<RecordNo>{invoice.invoiceNumber}</RecordNo>}
                icon={invoice.billedTo ? invoice.billedTo.type : undefined}
                title={
                    toBilledTo ? (
                        <Link to={toBilledTo} className={linkClass}>
                            {billedToName}
                        </Link>
                    ) : (
                        billedToName
                    )
                }
                meta={[
                    // One status badge; for a partly paid invoice past due, the due label says "Overdue".
                    <Badge key="status" tone={INVOICE_STATUS_TONE[invoice.displayedStatus]}>
                        {invoiceStatusLabel(invoice.displayedStatus)}
                    </Badge>,
                    // Settled (F-37): no due label; a paid invoice says when it was paid instead.
                    paidOn ? (
                        <span key="paid-on" className="inline-flex items-center gap-1 whitespace-nowrap text-ink-muted tabular-nums">
                            <Icon name="check" size="sm" className="shrink-0" />
                            Paid on {formatDate(paidOn, { short: true })}
                        </span>
                    ) : null,
                    invoice.baseStatus === 'ISSUED' && !settled ? (
                        <DueLabel
                            key="due"
                            dueDate={invoice.dueDate}
                            open={isInvoiceOpen(invoice)}
                            overdue={isInvoiceOpen(invoice) ? Boolean(invoice.isOverdue) : undefined}
                        />
                    ) : null,
                ]}
                actions={
                    isAdmin && (
                        <>
                            {isDraft && (
                                <Button icon="issue" onClick={() => status.ask('ISSUED')} disabled={busy}>
                                    Issue invoice
                                </Button>
                            )}
                            {canRecordPayment && (
                                <Button icon="payment" to={`/invoices/${invoice.id}/payments/new`} disabled={!online}>
                                    Record payment
                                </Button>
                            )}
                            <Button variant="secondary" icon="edit" to={`/invoices/${invoice.id}/edit`} disabled={!online}>
                                Edit
                            </Button>
                        </>
                    )
                }
                more={isAdmin ? [invoice.baseStatus !== 'CANCELLED' && { label: 'Cancel invoice', tone: 'danger', onSelect: () => status.ask('CANCELLED') }] : undefined}
                moreDisabled={busy}
            >
                {isAdmin && !online && <OfflineActionHint />}
            </RecordHeader>
            {/*
              F-38, same split as order detail. Phones: one column in the order Details, Money summary,
              Payments (the left column's wrapper is `contents`, so `order-*` interleaves the summary).
              lg+: left Details / Payments, right a 360 px Money summary that stays in view, so each
              label sits close to its amount.
            */}
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,22.5rem)] lg:items-start lg:gap-6">
                <div className="contents lg:flex lg:flex-col lg:gap-4">
                    <Section title="Details" flush={false} className="order-1 lg:order-none">
                        <FactList
                            items={[
                                { label: 'Invoice date', value: formatDate(invoice.invoiceDate) },
                                { label: 'Due date', value: formatDate(invoice.dueDate) },
                                { label: 'Related order', value: orderLabel, to: invoice.order && invoice.order.id ? `/orders/${invoice.order.id}` : undefined, span: true },
                                { label: 'Description', value: invoice.description || '', span: true },
                            ]}
                        />
                    </Section>
                    <InvoicePaymentsSection invoice={invoice} readOnly={!isAdmin} className="order-3 lg:order-none" />
                </div>
                <MoneySummary
                    amount={invoice.amount}
                    tax={invoice.tax}
                    total={invoice.total}
                    received={invoice.amountReceived}
                    outstanding={invoice.outstanding}
                    outstandingTone={look.tone}
                    outstandingHint={look.hint}
                    className="order-2 lg:sticky lg:top-4 lg:order-none"
                />
            </div>
            {status.dialog}
        </>
    );
}

/**
 * Invoice detail (F-06, F-07, F-25, F-37, F-38): header with status, due label and state actions (Issue invoice
 * on a draft, Record payment while something is outstanding, Edit, More > Cancel invoice), facts, money
 * summary and payments. A settled invoice (paid or cancelled) shows no due label and no Record payment;
 * a paid one shows "Paid on <last Paid payment date>". Members (P-26 F-56) see it read-only: no
 * header actions, no More menu, payments are plain rows (the backend returns 404 for invoices
 * outside their orders, shown as "Invoice not found").
 */
export default function InvoiceDetailPage() {
    const { invoiceId } = useParams();
    const invoice = useInvoice(invoiceId);
    useRecordVisit('invoice', invoiceId, invoice);
    return (
        <PageBody width="detail">
            <PageHeader backTo="/invoices" backLabel="Invoices" />
            <DataView resource={invoice} skeleton="detail" notFoundTitle="Invoice not found">{(i) => <InvoiceDetail invoice={i} reload={invoice.reload} />}</DataView>
        </PageBody>
    );
}
