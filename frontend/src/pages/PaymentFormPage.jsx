import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import ClientIcon from '../components/ClientIcon.jsx';
import DataView from '../components/DataView.jsx';
import DateField from '../components/DateField.jsx';
import EmptyState from '../components/EmptyState.jsx';
import FormFooter from '../components/FormFooter.jsx';
import FormLayout, { FormHeading } from '../components/FormLayout.jsx';
import FormSection, { FormRow } from '../components/FormSection.jsx';
import Icon from '../components/Icon.jsx';
import Money from '../components/Money.jsx';
import MoneyField from '../components/MoneyField.jsx';
import NotFoundState from '../components/NotFoundState.jsx';
import PageBody from '../components/PageBody.jsx';
import PageHeader from '../components/PageHeader.jsx';
import RecordNo from '../components/RecordNo.jsx';
import SelectField from '../components/SelectField.jsx';
import TextField from '../components/TextField.jsx';
import { getInvoice } from '../api/invoices.js';
import { createPayment, updatePayment } from '../api/payments.js';
import { PAYMENT_LIMITS, PAYMENT_STATUSES } from '../constants/payments.js';
import { useInvoice } from '../hooks/useInvoices.js';
import useOnlineStatus from '../hooks/useOnlineStatus.js';
import useSubmit from '../hooks/useSubmit.js';
import useToast from '../hooks/useToast.js';
import { todayLocal } from '../utils/dates.js';
import { formatMoney } from '../utils/format.js';
import { parseMoney } from '../utils/validation.js';

const RECEIVED = 'received';
const REQUEST = 'request';

/** Statuses a new payment request can start with (F-26); the edit form keeps every status. */
const REQUEST_STATUSES = PAYMENT_STATUSES.filter((o) => o.value === 'CREATED' || o.value === 'SENT');

const MODES = [
    { value: RECEIVED, label: 'Payment received', text: 'Money already in. Counts as received.', icon: 'payment' },
    { value: REQUEST, label: 'Payment request / link', text: 'Ask for payment. Not received yet.', icon: 'link' },
];

const text = (v) => (v === null || v === undefined ? '' : String(v));
const orNull = (v) => (v.trim() === '' ? null : v.trim());
const isNegative = (v) => String(v ?? '').trim().startsWith('-');

/** The invoice's outstanding as the amount to prefill; empty when nothing is owed. */
function outstandingAmount(invoice) {
    const n = Number(invoice.outstanding);
    return Number.isFinite(n) && n > 0 ? String(n) : '';
}

function toForm(payment, invoice) {
    if (!payment) {
        // New payment (F-26): received today for the full outstanding; a request starts as Created.
        return {
            amount: outstandingAmount(invoice),
            link: '',
            expiryDate: '',
            status: 'CREATED',
            paymentDate: todayLocal(),
            transactionReference: '',
        };
    }
    return {
        amount: text(payment.amount),
        link: text(payment.link),
        expiryDate: text(payment.expiryDate),
        status: payment.status || 'CREATED',
        paymentDate: text(payment.paymentDate),
        transactionReference: text(payment.transactionReference),
    };
}

/** The status the server receives: Paid for a received payment, the chosen one otherwise. */
const statusOf = (form, mode) => (mode === RECEIVED ? 'PAID' : form.status);

function validate(form, mode) {
    const errors = {};
    const amount = parseMoney(form.amount);
    if (amount === null || amount === 0 || isNegative(form.amount)) errors.amount = 'Amount must be more than 0';
    else if (Number.isNaN(amount)) errors.amount = 'Enter a valid amount, e.g. 5000.00';
    else if (amount > PAYMENT_LIMITS.maxAmount) errors.amount = 'Amount is too large';
    const status = statusOf(form, mode);
    if (!status) errors.status = 'Choose a status';
    if (mode !== RECEIVED && form.link.trim().length > PAYMENT_LIMITS.link) {
        errors.link = `Link or reference can be at most ${PAYMENT_LIMITS.link} characters`;
    }
    if (mode !== REQUEST && form.transactionReference.trim().length > PAYMENT_LIMITS.transactionReference) {
        errors.transactionReference = `Transaction reference can be at most ${PAYMENT_LIMITS.transactionReference} characters`;
    }
    if (status === 'PAID' && !form.paymentDate) errors.paymentDate = 'Enter the payment date for a paid payment';
    return errors;
}

/**
 * Request body. Edit (mode null) sends every field, since PUT clears omitted optional fields. A new
 * received payment sends no link or expiry; a new request sends no payment date or transaction reference.
 */
function toBody(form, mode) {
    const all = {
        amount: parseMoney(form.amount),
        link: orNull(form.link),
        expiryDate: form.expiryDate || null,
        status: statusOf(form, mode),
        paymentDate: form.paymentDate || null,
        transactionReference: orNull(form.transactionReference),
    };
    if (mode === RECEIVED) return { ...all, link: null, expiryDate: null };
    if (mode === REQUEST) return { ...all, paymentDate: null, transactionReference: null };
    return all;
}

/** Two radio cards: "Payment received" (default) and "Payment request / link" (?mode=request). */
function ModeChoice({ value, onChange }) {
    return (
        <fieldset>
            <legend className="sr-only">Type of payment</legend>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {MODES.map((m) => {
                    const checked = value === m.value;
                    return (
                        <label
                            key={m.value}
                            className={`flex min-h-11 cursor-pointer items-start gap-3 rounded-card border bg-surface px-4 py-3 transition has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-accent ${
                                checked ? 'border-ink ring-1 ring-ink' : 'border-line hover:border-line-strong'
                            }`}
                        >
                            <input type="radio" name="payment-mode" value={m.value} checked={checked} onChange={() => onChange(m.value)} className="sr-only" />
                            <span className={`mt-0.5 shrink-0 ${checked ? 'text-ink' : 'text-ink-subtle'}`}>
                                <Icon name={m.icon} size="md" />
                            </span>
                            <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                                <span className="text-sm font-medium text-ink">{m.label}</span>
                                <span className="text-sm text-ink-muted md:text-[13px]/[18px]">{m.text}</span>
                            </span>
                            <span
                                aria-hidden="true"
                                className={`mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border ${checked ? 'border-ink' : 'border-line-strong'}`}
                            >
                                {checked && <span className="h-2.5 w-2.5 rounded-full bg-ink" />}
                            </span>
                        </label>
                    );
                })}
            </div>
        </fieldset>
    );
}

/** The invoice this payment belongs to: number, billed to and what is still outstanding. */
function InvoiceSummary({ invoice }) {
    const billedTo = invoice.billedTo || null;
    const outstanding = Number(invoice.outstanding) || 0;
    return (
        <div className="flex items-start justify-between gap-3 rounded-card border border-line bg-surface px-4 py-3">
            <div className="flex min-w-0 flex-col gap-0.5">
                <RecordNo>{invoice.invoiceNumber}</RecordNo>
                <span className="flex min-w-0 items-center gap-1.5 text-sm font-medium break-words text-ink">
                    {billedTo && <ClientIcon type={billedTo.type} size="inline" />}
                    <span className="min-w-0">{(billedTo && billedTo.name) || 'Unknown'}</span>
                </span>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-0.5">
                <span className="text-xs text-ink-muted">Outstanding</span>
                <Money value={outstanding} paise="always" overdue={Boolean(invoice.isOverdue) && outstanding > 0} strong />
            </div>
        </div>
    );
}

/**
 * Toast after a new payment. A received one reloads the invoice for the new outstanding:
 * "Payment PAY-0005 recorded · Outstanding ₹7,700" ("Payment PAY-0005 recorded" if the reload fails).
 */
async function savedMessage(invoiceId, payment, mode) {
    const number = payment && payment.paymentNumber ? ` ${payment.paymentNumber}` : '';
    if (mode === REQUEST) return `Payment request${number} created`;
    const done = `Payment${number} recorded`;
    try {
        const res = await getInvoice(invoiceId);
        const fresh = res && res.data;
        if (!fresh || res.fromCache || fresh.outstanding === undefined || fresh.outstanding === null) return done;
        if (Number(fresh.outstanding) <= 0) return `${done} · Invoice fully paid`;
        return `${done} · Outstanding ${formatMoney(fresh.outstanding, { paise: 'auto' })}`;
    } catch {
        return done;
    }
}

function PaymentForm({ invoice, payment }) {
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const isEdit = Boolean(payment);
    // Edit has no mode: every field with the full Status select, as before.
    const mode = isEdit ? null : searchParams.get('mode') === REQUEST ? REQUEST : RECEIVED;
    // One id per form: a retried create after a dropped connection returns the same payment (200).
    const newId = useRef(isEdit ? null : crypto.randomUUID());
    const [form, setForm] = useState(() => toForm(payment, invoice));
    const [localErrors, setLocalErrors] = useState({});
    const [finishing, setFinishing] = useState(false);
    const { submit, submitting, formError, fieldErrors, clearErrors } = useSubmit({ errorToast: true });
    const toast = useToast();

    const set = (field) => (value) => {
        setForm((f) => {
            const next = { ...f, [field]: value };
            // Marking a payment Paid fills in today's date when none is set yet; staff can change it.
            if (field === 'status' && value === 'PAID' && !f.paymentDate) next.paymentDate = todayLocal();
            return next;
        });
        if (localErrors[field] || (field === 'status' && localErrors.paymentDate)) {
            setLocalErrors((e) => ({ ...e, [field]: undefined, ...(field === 'status' ? { paymentDate: undefined } : {}) }));
        }
    };
    const errorOf = (field) => localErrors[field] || fieldErrors[field];

    const changeMode = (next) => {
        setLocalErrors({});
        clearErrors();
        const params = new URLSearchParams(searchParams);
        if (next === REQUEST) params.set('mode', REQUEST);
        else params.delete('mode');
        setSearchParams(params, { replace: true });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        const errors = validate(form, mode);
        setLocalErrors(errors);
        if (Object.keys(errors).length) return;
        const body = toBody(form, mode);
        const result = await submit(() =>
            isEdit ? updatePayment(invoice.id, payment.id, body) : createPayment(invoice.id, { id: newId.current, ...body })
        );
        if (!result.ok) return;
        if (isEdit) {
            toast.success('Changes saved');
        } else {
            setFinishing(true);
            toast.success(await savedMessage(invoice.id, result.data, mode));
        }
        // The invoice detail remounts and refetches, so received, outstanding and status update.
        navigate(`/invoices/${invoice.id}`, { replace: true });
    };

    const submitLabel = isEdit ? 'Save' : mode === REQUEST ? 'Create request' : 'Record payment';
    const description = isEdit
        ? 'Only Paid payments count as received.'
        : mode === REQUEST
          ? 'A request does not count as received until it is marked Paid.'
          : 'Prefilled with the outstanding amount and today. Change anything that differs.';

    return (
        <FormLayout
            title={isEdit ? 'Edit payment' : 'Record payment'}
            meta={isEdit ? payment.paymentNumber : undefined}
            description={description}
            error={formError}
            onSubmit={handleSubmit}
            before={
                <>
                    <InvoiceSummary invoice={invoice} />
                    {!isEdit && <ModeChoice value={mode} onChange={changeMode} />}
                </>
            }
            footer={<FormFooter submitLabel={submitLabel} submitting={submitting || finishing} cancelTo={`/invoices/${invoice.id}`} />}
        >
            {mode === RECEIVED && (
                <FormSection title="Payment received">
                    <FormRow>
                        <MoneyField label="Amount" required placeholder="0.00" value={form.amount} onChange={set('amount')} error={errorOf('amount')} />
                        <DateField label="Payment date" required value={form.paymentDate} onChange={set('paymentDate')} error={errorOf('paymentDate')} />
                    </FormRow>
                    <TextField
                        label="Transaction reference"
                        value={form.transactionReference}
                        onChange={set('transactionReference')}
                        error={errorOf('transactionReference')}
                        hint="Optional. UTR, cheque number or gateway payment ID."
                        autoComplete="off"
                    />
                </FormSection>
            )}
            {mode === REQUEST && (
                <FormSection title="Payment request">
                    <FormRow>
                        <MoneyField label="Amount" required placeholder="0.00" value={form.amount} onChange={set('amount')} error={errorOf('amount')} />
                        <SelectField label="Status" required options={REQUEST_STATUSES} value={form.status} onChange={set('status')} error={errorOf('status')} />
                    </FormRow>
                    <TextField
                        label="Payment link or reference"
                        value={form.link}
                        onChange={set('link')}
                        error={errorOf('link')}
                        hint="Optional. Paste the link from your payment gateway, or any reference."
                        autoComplete="off"
                    />
                    <DateField label="Expiry date" relative value={form.expiryDate} onChange={set('expiryDate')} error={errorOf('expiryDate')} />
                </FormSection>
            )}
            {isEdit && (
                <FormSection title="Payment">
                    <FormRow>
                        <MoneyField label="Amount" required placeholder="0.00" value={form.amount} onChange={set('amount')} error={errorOf('amount')} />
                        <SelectField label="Status" required options={PAYMENT_STATUSES} value={form.status} onChange={set('status')} error={errorOf('status')} />
                    </FormRow>
                    <FormRow>
                        <DateField
                            label="Payment date"
                            required={form.status === 'PAID'}
                            value={form.paymentDate}
                            onChange={set('paymentDate')}
                            error={errorOf('paymentDate')}
                        />
                        <DateField label="Expiry date" relative value={form.expiryDate} onChange={set('expiryDate')} error={errorOf('expiryDate')} />
                    </FormRow>
                    <TextField
                        label="Payment link or reference"
                        value={form.link}
                        onChange={set('link')}
                        error={errorOf('link')}
                        hint="Optional. Paste the link from your payment gateway, or any reference."
                        autoComplete="off"
                    />
                    <TextField
                        label="Transaction reference"
                        value={form.transactionReference}
                        onChange={set('transactionReference')}
                        error={errorOf('transactionReference')}
                        autoComplete="off"
                    />
                </FormSection>
            )}
        </FormLayout>
    );
}

function PaymentFormContent({ invoice, paymentId }) {
    if (paymentId) {
        const payment = (invoice.payments || []).find((p) => p.id === paymentId);
        if (!payment) {
            return <NotFoundState title="Payment not found" />;
        }
        return <PaymentForm invoice={invoice} payment={payment} />;
    }
    // Payments need an issued invoice (base status, not displayed status). The server enforces it too.
    if (invoice.baseStatus !== 'ISSUED') {
        const draft = invoice.baseStatus === 'DRAFT';
        return (
            <>
                <FormHeading title="Record payment" />
                <EmptyState
                    title={draft ? 'Issue the invoice to record payments' : 'This invoice is cancelled'}
                    text="Payments can be recorded only on issued invoices."
                    action={{ label: 'Back to invoice', to: `/invoices/${invoice.id}` }}
                />
            </>
        );
    }
    return <PaymentForm invoice={invoice} />;
}

/**
 * Record payment (/invoices/:invoiceId/payments/new, F-26): a received payment by default (status
 * Paid, today, amount = outstanding); `?mode=request` records a payment request / link instead.
 * Edit payment (/invoices/:invoiceId/payments/:paymentId/edit, F-07) keeps every field. Online only.
 * The payment being edited is read from the invoice detail's `payments` (no single-payment GET).
 */
export default function PaymentFormPage() {
    const { invoiceId, paymentId } = useParams();
    const navigate = useNavigate();
    const { online } = useOnlineStatus();
    const invoice = useInvoice(invoiceId);
    // A form opened while offline shows the "needs a connection" state until the app is online once.
    const [everOnline, setEverOnline] = useState(online);
    useEffect(() => {
        if (online) setEverOnline(true);
    }, [online]);

    const title = paymentId ? 'Edit payment' : 'Record payment';

    if (!everOnline) {
        return (
            <PageBody width="form">
                <PageHeader backTo={`/invoices/${invoiceId}`} backLabel="Invoice" />
                <FormHeading title={title} />
                <EmptyState
                    icon="offline"
                    title="Recording payments needs a connection"
                    text="Connect to the internet and try again."
                    action={{ label: 'Go back', onClick: () => navigate(`/invoices/${invoiceId}`) }}
                />
            </PageBody>
        );
    }

    return (
        <PageBody width="form">
            <PageHeader backTo={`/invoices/${invoiceId}`} backLabel="Invoice" />
            <DataView resource={invoice} skeleton="form" notFoundTitle="Invoice not found">
                {(i) => <PaymentFormContent invoice={i} paymentId={paymentId} />}
            </DataView>
        </PageBody>
    );
}
