import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import ClientPicker from '../components/ClientPicker.jsx';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import DataView from '../components/DataView.jsx';
import DateField from '../components/DateField.jsx';
import EmptyState from '../components/EmptyState.jsx';
import FormError from '../components/FormError.jsx';
import FormFooter from '../components/FormFooter.jsx';
import MoneyField from '../components/MoneyField.jsx';
import OrderPicker from '../components/OrderPicker.jsx';
import PageHeader from '../components/PageHeader.jsx';
import SelectField from '../components/SelectField.jsx';
import TextArea from '../components/TextArea.jsx';
import TextField from '../components/TextField.jsx';
import { createInvoice, updateInvoice } from '../api/invoices.js';
import { INVOICE_BASE_STATUSES, INVOICE_LIMITS } from '../constants/invoices.js';
import { useInvoice } from '../hooks/useInvoices.js';
import useOnlineStatus from '../hooks/useOnlineStatus.js';
import { useOrder } from '../hooks/useOrders.js';
import useSubmit from '../hooks/useSubmit.js';
import { formatDate, formatMoney } from '../utils/format.js';
import { parseMoney } from '../utils/validation.js';

const today = () => formatDate(new Date());
const party = (p) => (p && p.id ? { type: p.type, id: p.id, name: p.name } : null);

function toForm(invoice) {
    if (!invoice) {
        return {
            billedTo: null,
            order: null,
            invoiceDate: today(),
            dueDate: '',
            description: '',
            amount: '',
            tax: '0',
            status: 'DRAFT',
        };
    }
    return {
        billedTo: party(invoice.billedTo),
        order: invoice.order && invoice.order.id ? { id: invoice.order.id, orderNumber: invoice.order.orderNumber, clientName: null } : null,
        invoiceDate: invoice.invoiceDate || '',
        dueDate: invoice.dueDate || '',
        description: invoice.description || '',
        amount: invoice.amount === null || invoice.amount === undefined ? '' : String(invoice.amount),
        tax: invoice.tax === null || invoice.tax === undefined ? '0' : String(invoice.tax),
        status: invoice.baseStatus || 'DRAFT',
    };
}

const isNegative = (v) => String(v ?? '').trim().startsWith('-');

// Tax left empty counts as 0 (contract default).
const parseTax = (v) => (String(v ?? '').trim() === '' ? 0 : parseMoney(v));

/** amount + tax summed in paise (never float sums). null when either is not a valid number. */
function liveTotal(form) {
    const amount = parseMoney(form.amount);
    const tax = parseTax(form.tax);
    if (amount === null || Number.isNaN(amount) || Number.isNaN(tax)) return null;
    return (Math.round(amount * 100) + Math.round(tax * 100)) / 100;
}

function validate(form, isEdit) {
    const errors = {};
    if (!form.billedTo) errors.billedTo = 'Choose who to bill';
    if (!form.invoiceDate) errors.invoiceDate = 'Enter the invoice date';
    if (!form.dueDate) errors.dueDate = 'Enter a due date';
    else if (form.invoiceDate && form.dueDate < form.invoiceDate) errors.dueDate = "Due date can't be before the invoice date";
    const amount = parseMoney(form.amount);
    if (amount === null || amount === 0 || isNegative(form.amount)) errors.amount = 'Amount must be more than 0';
    else if (Number.isNaN(amount)) errors.amount = 'Enter a valid amount, e.g. 15000.50';
    else if (amount > INVOICE_LIMITS.maxAmount) errors.amount = 'Amount is too large';
    const tax = parseTax(form.tax);
    if (isNegative(form.tax)) errors.tax = "Tax can't be negative";
    else if (Number.isNaN(tax)) errors.tax = 'Enter a valid amount, e.g. 1800.00';
    else if (tax > INVOICE_LIMITS.maxAmount) errors.tax = 'Tax is too large';
    if (form.description.length > INVOICE_LIMITS.description) errors.description = `Description can be at most ${INVOICE_LIMITS.description} characters`;
    if (isEdit && !form.status) errors.status = 'Choose a status';
    return errors;
}

// Full editable field set (PUT clears omitted optional fields, so every field is always sent).
function toBody(form, isEdit) {
    const body = {
        billedToType: form.billedTo.type,
        billedToId: form.billedTo.id,
        orderId: form.order ? form.order.id : null,
        invoiceDate: form.invoiceDate,
        dueDate: form.dueDate,
        description: form.description.trim() === '' ? null : form.description.trim(),
        amount: parseMoney(form.amount),
        tax: parseTax(form.tax),
    };
    if (isEdit) body.baseStatus = form.status;
    return body;
}

// Server error fields (request body paths) -> form fields.
function serverError(fieldErrors, field) {
    const keys = {
        billedTo: ['billedToId', 'billedToType'],
        order: ['orderId'],
        status: ['baseStatus'],
    }[field] || [field];
    for (const k of keys) if (fieldErrors[k]) return fieldErrors[k];
    return undefined;
}

/**
 * Prefills related order and billed to from ?orderId= once, when that order has loaded.
 * Billed to comes from the order's client, never from "received from".
 */
function useOrderPrefill(orderId, setForm) {
    const order = useOrder(orderId);
    const applied = useRef(false);
    useEffect(() => {
        if (applied.current || order.status !== 'loaded' || !order.data) return;
        applied.current = true;
        const o = order.data;
        setForm((f) => ({
            ...f,
            // Keep anything the user already picked while the order was loading.
            order: f.order || { id: o.id, orderNumber: o.orderNumber, clientName: (o.client && o.client.name) || null },
            billedTo: f.billedTo || party(o.client),
        }));
    }, [order.status, order.data, setForm]);
    return order;
}

function InvoiceForm({ invoice, prefillOrderId }) {
    const navigate = useNavigate();
    const isEdit = Boolean(invoice);
    // One id per form: a retried create after a dropped connection returns the same invoice (200).
    const newId = useRef(isEdit ? null : crypto.randomUUID());
    const [form, setForm] = useState(() => toForm(invoice));
    const [localErrors, setLocalErrors] = useState({});
    const [confirmCancel, setConfirmCancel] = useState(false);
    const { submit, submitting, formError, fieldErrors } = useSubmit();
    const prefill = useOrderPrefill(isEdit ? null : prefillOrderId, setForm);

    const clearError = (field) => {
        if (localErrors[field]) setLocalErrors((e) => ({ ...e, [field]: undefined }));
    };
    const set = (field) => (value) => {
        setForm((f) => ({ ...f, [field]: value }));
        clearError(field);
    };

    const errorOf = (field) => localErrors[field] || serverError(fieldErrors, field);

    const save = async () => {
        setConfirmCancel(false);
        const body = toBody(form, isEdit);
        const result = await submit(() => (isEdit ? updateInvoice(invoice.id, body) : createInvoice({ id: newId.current, ...body })));
        if (result.ok) navigate(`/invoices/${isEdit ? invoice.id : newId.current}`, { replace: true });
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        const errors = validate(form, isEdit);
        setLocalErrors(errors);
        if (Object.keys(errors).length) return;
        if (isEdit && form.status === 'CANCELLED' && invoice.baseStatus !== 'CANCELLED') {
            setConfirmCancel(true);
            return;
        }
        save();
    };

    const total = liveTotal(form);
    const cancelTo = isEdit ? `/invoices/${invoice.id}` : prefillOrderId ? `/orders/${prefillOrderId}` : '/invoices';
    const prefillFailed = !isEdit && prefillOrderId && (prefill.status === 'error' || prefill.status === 'unavailable');

    return (
        <form noValidate onSubmit={handleSubmit} className="flex max-w-xl flex-col gap-4">
            <FormError message={formError} />
            {prefillFailed && <FormError message="Couldn't load the order to fill in this invoice. Choose the details below." />}
            {isEdit ? (
                <TextField label="Invoice number" value={invoice.invoiceNumber} readOnly disabled className="font-mono" />
            ) : (
                <p className="text-sm text-ink-muted">Number is assigned when you save. New invoices start as Draft.</p>
            )}
            <ClientPicker
                label="Billed to"
                required
                anyPerson
                sheetTitle="Who are you billing?"
                value={form.billedTo}
                onChange={set('billedTo')}
                error={errorOf('billedTo')}
                hint="A person or a company."
            />
            <OrderPicker
                value={form.order}
                onChange={set('order')}
                error={errorOf('order')}
                hint={!isEdit && prefill.status === 'loading' && prefillOrderId ? 'Loading the order…' : 'Optional. Choosing an order does not change billed to.'}
            />
            <div className="grid gap-4 sm:grid-cols-2">
                <DateField label="Invoice date" required value={form.invoiceDate} onChange={set('invoiceDate')} error={errorOf('invoiceDate')} />
                <DateField label="Due date" required value={form.dueDate} onChange={set('dueDate')} error={errorOf('dueDate')} />
            </div>
            <TextArea label="Description" rows={3} value={form.description} onChange={set('description')} error={errorOf('description')} />
            <div className="grid gap-4 sm:grid-cols-2">
                <MoneyField label="Amount" required placeholder="0.00" value={form.amount} onChange={set('amount')} error={errorOf('amount')} />
                <MoneyField label="Tax" placeholder="0.00" value={form.tax} onChange={set('tax')} error={errorOf('tax')} />
            </div>
            <div className="flex items-baseline justify-between rounded-control border border-line bg-page px-3 py-2.5">
                <span className="text-sm text-ink-muted">Total (amount + tax)</span>
                <span className="font-semibold text-ink tabular-nums">{total === null ? '—' : formatMoney(total)}</span>
            </div>
            {isEdit && (
                <SelectField
                    label="Status"
                    required
                    options={INVOICE_BASE_STATUSES}
                    value={form.status}
                    onChange={set('status')}
                    error={errorOf('status')}
                />
            )}
            <FormFooter submitLabel={isEdit ? 'Save' : 'Create invoice'} submitting={submitting} cancelTo={cancelTo} />
            <ConfirmDialog
                open={confirmCancel}
                title="Cancel this invoice?"
                text="It will no longer count as outstanding."
                confirmLabel="Cancel invoice"
                cancelLabel="Keep it"
                tone="danger"
                busy={submitting}
                onConfirm={save}
                onCancel={() => setConfirmCancel(false)}
            />
        </form>
    );
}

function EditInvoice({ invoiceId }) {
    const invoice = useInvoice(invoiceId);
    return <DataView resource={invoice}>{(i) => <InvoiceForm invoice={i} />}</DataView>;
}

/** New invoice (/invoices/new, ?orderId= prefill) and Edit invoice (/invoices/:invoiceId/edit), F-06. Online only. */
export default function InvoiceFormPage() {
    const { invoiceId } = useParams();
    const [params] = useSearchParams();
    const navigate = useNavigate();
    const { online } = useOnlineStatus();
    // A form opened while offline shows the "needs a connection" state until the app is online once.
    const [everOnline, setEverOnline] = useState(online);
    useEffect(() => {
        if (online) setEverOnline(true);
    }, [online]);

    const isEdit = Boolean(invoiceId);
    const prefillOrderId = isEdit ? null : params.get('orderId');
    const title = isEdit ? 'Edit invoice' : 'New invoice';

    if (!everOnline) {
        return (
            <>
                <PageHeader title={title} />
                <EmptyState
                    icon="offline"
                    title="Adding and editing need a connection"
                    text="Connect to the internet and try again."
                    action={{ label: 'Go back', onClick: () => navigate(isEdit ? `/invoices/${invoiceId}` : '/invoices') }}
                />
            </>
        );
    }

    return (
        <>
            <PageHeader title={title} />
            {isEdit ? <EditInvoice invoiceId={invoiceId} /> : <InvoiceForm key={prefillOrderId || 'new'} prefillOrderId={prefillOrderId} />}
        </>
    );
}
