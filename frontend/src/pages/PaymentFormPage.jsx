import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import DataView from '../components/DataView.jsx';
import DateField from '../components/DateField.jsx';
import EmptyState from '../components/EmptyState.jsx';
import FormFooter from '../components/FormFooter.jsx';
import FormLayout, { FormHeading } from '../components/FormLayout.jsx';
import FormSection, { FormRow } from '../components/FormSection.jsx';
import MoneyField from '../components/MoneyField.jsx';
import NotFoundState from '../components/NotFoundState.jsx';
import PageBody from '../components/PageBody.jsx';
import PageHeader from '../components/PageHeader.jsx';
import SelectField from '../components/SelectField.jsx';
import TextField from '../components/TextField.jsx';
import { createPayment, updatePayment } from '../api/payments.js';
import { PAYMENT_LIMITS, PAYMENT_STATUSES } from '../constants/payments.js';
import { useInvoice } from '../hooks/useInvoices.js';
import useOnlineStatus from '../hooks/useOnlineStatus.js';
import useSubmit from '../hooks/useSubmit.js';
import useToast from '../hooks/useToast.js';
import { todayLocal } from '../utils/dates.js';
import { formatMoney } from '../utils/format.js';
import { parseMoney } from '../utils/validation.js';

const today = () => todayLocal();
const text = (v) => (v === null || v === undefined ? '' : String(v));

function toForm(payment) {
    if (!payment) {
        return { amount: '', link: '', expiryDate: '', status: 'CREATED', paymentDate: '', transactionReference: '' };
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

const isNegative = (v) => String(v ?? '').trim().startsWith('-');

function validate(form) {
    const errors = {};
    const amount = parseMoney(form.amount);
    if (amount === null || amount === 0 || isNegative(form.amount)) errors.amount = 'Amount must be more than 0';
    else if (Number.isNaN(amount)) errors.amount = 'Enter a valid amount, e.g. 5000.00';
    else if (amount > PAYMENT_LIMITS.maxAmount) errors.amount = 'Amount is too large';
    if (form.link.trim().length > PAYMENT_LIMITS.link) errors.link = `Link or reference can be at most ${PAYMENT_LIMITS.link} characters`;
    if (form.transactionReference.trim().length > PAYMENT_LIMITS.transactionReference) {
        errors.transactionReference = `Transaction reference can be at most ${PAYMENT_LIMITS.transactionReference} characters`;
    }
    if (!form.status) errors.status = 'Choose a status';
    if (form.status === 'PAID' && !form.paymentDate) errors.paymentDate = 'Enter the payment date for a paid payment';
    return errors;
}

const orNull = (v) => (v.trim() === '' ? null : v.trim());

// Full editable field set (PUT clears omitted optional fields, so every field is always sent).
function toBody(form) {
    return {
        amount: parseMoney(form.amount),
        link: orNull(form.link),
        expiryDate: form.expiryDate || null,
        status: form.status,
        paymentDate: form.paymentDate || null,
        transactionReference: orNull(form.transactionReference),
    };
}

function PaymentForm({ invoice, payment }) {
    const navigate = useNavigate();
    const isEdit = Boolean(payment);
    // One id per form: a retried create after a dropped connection returns the same payment (200).
    const newId = useRef(isEdit ? null : crypto.randomUUID());
    const [form, setForm] = useState(() => toForm(payment));
    const [localErrors, setLocalErrors] = useState({});
    const { submit, submitting, formError, fieldErrors } = useSubmit({ errorToast: true });
    const toast = useToast();

    const set = (field) => (value) => {
        setForm((f) => {
            const next = { ...f, [field]: value };
            // Marking a payment Paid fills in today's date when none is set yet; staff can change it.
            if (field === 'status' && value === 'PAID' && !f.paymentDate) next.paymentDate = today();
            return next;
        });
        if (localErrors[field] || (field === 'status' && localErrors.paymentDate)) {
            setLocalErrors((e) => ({ ...e, [field]: undefined, ...(field === 'status' ? { paymentDate: undefined } : {}) }));
        }
    };
    const errorOf = (field) => localErrors[field] || fieldErrors[field];

    const handleSubmit = async (e) => {
        e.preventDefault();
        const errors = validate(form);
        setLocalErrors(errors);
        if (Object.keys(errors).length) return;
        const body = toBody(form);
        const result = await submit(() =>
            isEdit ? updatePayment(invoice.id, payment.id, body) : createPayment(invoice.id, { id: newId.current, ...body })
        );
        // The invoice detail remounts and refetches, so received, outstanding and status update.
        if (!result.ok) return;
        toast.success(isEdit ? 'Changes saved' : 'Payment saved');
        navigate(`/invoices/${invoice.id}`, { replace: true });
    };

    return (
        <FormLayout
            title={isEdit ? 'Edit payment' : 'Add payment'}
            meta={isEdit ? payment.paymentNumber : undefined}
            description={isEdit ? undefined : 'Reference is assigned when you save. Only Paid payments count as received.'}
            error={formError}
            onSubmit={handleSubmit}
            before={
                <div className="flex items-baseline justify-between gap-3 rounded-control border border-line bg-surface-subtle px-3 py-2.5">
                    <span className="text-sm text-ink-muted">
                        Invoice <span className="text-ink tabular-nums">{invoice.invoiceNumber}</span> outstanding
                    </span>
                    <span className="font-semibold text-ink tabular-nums">{formatMoney(invoice.outstanding)}</span>
                </div>
            }
            footer={<FormFooter submitLabel={isEdit ? 'Save' : 'Add payment'} submitting={submitting} cancelTo={`/invoices/${invoice.id}`} />}
        >
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
    // Add payment needs an issued invoice (base status, not displayed status). The server enforces it too.
    if (invoice.baseStatus !== 'ISSUED') {
        return (
            <>
                <FormHeading title="Add payment" />
                <EmptyState
                    title="Issue the invoice to add payments"
                    text="Payments can be added only to issued invoices."
                    action={{ label: 'Back to invoice', to: `/invoices/${invoice.id}` }}
                />
            </>
        );
    }
    return <PaymentForm invoice={invoice} />;
}

/**
 * Add payment (/invoices/:invoiceId/payments/new) and Edit payment
 * (/invoices/:invoiceId/payments/:paymentId/edit), F-07. Online only. The payment being edited is
 * read from the invoice detail's `payments` (the contract has no single-payment GET).
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

    const title = paymentId ? 'Edit payment' : 'Add payment';

    if (!everOnline) {
        return (
            <PageBody width="form">
                <PageHeader backTo={`/invoices/${invoiceId}`} backLabel="Invoice" />
                <FormHeading title={title} />
                <EmptyState
                    icon="offline"
                    title="Adding and editing need a connection"
                    text="Connect to the internet and try again."
                    action={{ label: 'Go back', onClick: () => navigate(`/invoices/${invoiceId}`) }}
                />
            </PageBody>
        );
    }

    return (
        <PageBody width="form">
            <PageHeader backTo={`/invoices/${invoiceId}`} backLabel="Invoice" />
            <DataView resource={invoice} skeleton="form" notFoundTitle="Invoice not found">{(i) => <PaymentFormContent invoice={i} paymentId={paymentId} />}</DataView>
        </PageBody>
    );
}
