import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import ClientPicker from '../components/ClientPicker.jsx';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import DataView from '../components/DataView.jsx';
import DateField from '../components/DateField.jsx';
import EmptyState from '../components/EmptyState.jsx';
import FormFooter from '../components/FormFooter.jsx';
import FormLayout, { FormHeading } from '../components/FormLayout.jsx';
import FormSection, { FormRow } from '../components/FormSection.jsx';
import MoneyField from '../components/MoneyField.jsx';
import OrderPicker, { orderPickerValue } from '../components/OrderPicker.jsx';
import PageBody from '../components/PageBody.jsx';
import PageHeader from '../components/PageHeader.jsx';
import SelectField from '../components/SelectField.jsx';
import TextArea from '../components/TextArea.jsx';
import { createInvoice, updateInvoice } from '../api/invoices.js';
import { INVOICE_BASE_STATUSES, INVOICE_LIMITS } from '../constants/invoices.js';
import useClientPreselect, { readClientPreselect } from '../hooks/useClientPreselect.js';
import { useInvoice, useOrderInvoices } from '../hooks/useInvoices.js';
import useOnlineStatus from '../hooks/useOnlineStatus.js';
import { useOrder } from '../hooks/useOrders.js';
import useSubmit from '../hooks/useSubmit.js';
import useToast from '../hooks/useToast.js';
import { addDays, todayLocal } from '../utils/dates.js';
import { formatMoney } from '../utils/format.js';
import { parseMoney } from '../utils/validation.js';

const today = () => todayLocal();
/** Default due date of a new invoice (same rule as the server's create default, F-25). */
const DUE_AFTER_DAYS = 15;
const defaultDue = (invoiceDate) => addDays(invoiceDate, DUE_AFTER_DAYS);
const party = (p) => (p && p.id ? { type: p.type, id: p.id, name: p.name } : null);

function toForm(invoice) {
    if (!invoice) {
        const invoiceDate = today();
        return {
            billedTo: null,
            order: null,
            invoiceDate,
            dueDate: defaultDue(invoiceDate),
            description: '',
            amount: '',
            tax: '0',
            status: 'DRAFT',
        };
    }
    return {
        billedTo: party(invoice.billedTo),
        order: invoice.order && invoice.order.id ? { id: invoice.order.id, orderNumber: invoice.order.orderNumber, serviceName: null, clientName: null } : null,
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
// On create, baseStatus is 'DRAFT' ("Save as draft") or 'ISSUED' ("Save and issue"): one call (F-25).
function toBody(form, isEdit, createStatus) {
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
    body.baseStatus = isEdit ? form.status : createStatus;
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

const paise = (v) => Math.round(Number(v || 0) * 100);

/**
 * Not yet billed on an order = order amount - totals of its non-cancelled invoices, never below 0
 * (product revision, order billing). null when the order has no amount.
 */
function notYetBilled(order, invoices) {
    if (!order || order.amount === null || order.amount === undefined || order.amount === '') return null;
    const billed = (invoices || []).filter((i) => i.baseStatus !== 'CANCELLED').reduce((sum, i) => sum + paise(i.total), 0);
    return Math.max(0, paise(order.amount) - billed) / 100;
}

/**
 * Prefills the form from ?orderId= once, when the order and its invoices have settled (F-25):
 * related order, billed to (the order's client, never "received from"), description (the service)
 * and amount (not yet billed, when the order has an amount and its invoices loaded). Fields the user
 * already filled while loading are kept. Returns { order, unbilled } for the hints.
 */
function useOrderPrefill(orderId, setForm) {
    const order = useOrder(orderId);
    const invoices = useOrderInvoices(orderId);
    const applied = useRef(false);
    const invoicesSettled = invoices.status !== 'loading';
    const unbilled = order.data && invoices.status === 'loaded' ? notYetBilled(order.data, invoices.data) : null;
    useEffect(() => {
        if (applied.current || order.status !== 'loaded' || !order.data || !invoicesSettled) return;
        applied.current = true;
        const o = order.data;
        setForm((f) => ({
            ...f,
            order: f.order || orderPickerValue(o),
            billedTo: f.billedTo || party(o.client),
            description: f.description.trim() === '' ? o.serviceName || '' : f.description,
            amount: String(f.amount).trim() === '' && unbilled !== null && unbilled > 0 ? String(unbilled) : f.amount,
        }));
    }, [order.status, order.data, invoicesSettled, unbilled, setForm]);
    return { status: order.status, order: order.data || null, unbilled };
}

function InvoiceForm({ invoice, prefillOrderId, preselect }) {
    const navigate = useNavigate();
    const isEdit = Boolean(invoice);
    // One id per form: a retried create after a dropped connection returns the same invoice (200).
    const newId = useRef(isEdit ? null : crypto.randomUUID());
    const [form, setForm] = useState(() => toForm(invoice));
    const [localErrors, setLocalErrors] = useState({});
    const [confirmCancel, setConfirmCancel] = useState(false);
    // Which create button is saving ('ISSUED' primary, 'DRAFT' secondary), for its spinner.
    const [saving, setSaving] = useState(null);
    // A new invoice's due date follows the invoice date (+15 days) until the user sets it.
    const dueTouched = useRef(isEdit);
    const { submit, submitting, formError, fieldErrors } = useSubmit({ errorToast: true });
    const toast = useToast();
    const prefill = useOrderPrefill(isEdit ? null : prefillOrderId, setForm);
    // ?clientType=&clientId= on create (F-18): billed to may be any person or company.
    const preselected = useClientPreselect(isEdit ? null : preselect, (client) => {
        setForm((f) => (f.billedTo ? f : { ...f, billedTo: client }));
    });

    const clearError = (field) => {
        if (localErrors[field]) setLocalErrors((e) => ({ ...e, [field]: undefined }));
    };
    const set = (field) => (value) => {
        setForm((f) => ({ ...f, [field]: value }));
        clearError(field);
    };

    const setInvoiceDate = (value) => {
        setForm((f) => ({ ...f, invoiceDate: value, dueDate: dueTouched.current ? f.dueDate : defaultDue(value) || f.dueDate }));
        clearError('invoiceDate');
        if (!dueTouched.current) clearError('dueDate');
    };
    const setDueDate = (value) => {
        dueTouched.current = true;
        set('dueDate')(value);
    };

    const errorOf = (field) => localErrors[field] || serverError(fieldErrors, field);

    const save = async (createStatus) => {
        setConfirmCancel(false);
        setSaving(createStatus || null);
        const body = toBody(form, isEdit, createStatus);
        const result = await submit(() => (isEdit ? updateInvoice(invoice.id, body) : createInvoice({ id: newId.current, ...body })));
        setSaving(null);
        if (!result.ok) return;
        const id = isEdit ? invoice.id : newId.current;
        if (isEdit) {
            toast.success('Changes saved');
        } else {
            const data = result.data || {};
            const label = data.invoiceNumber ? `Invoice ${data.invoiceNumber}` : 'Invoice';
            // A retried create returns the stored invoice, so the toast follows the server's status.
            if ((data.baseStatus || createStatus) === 'ISSUED') {
                toast.success(`${label} issued`, { action: { label: 'Record payment', to: `/invoices/${id}/payments/new` } });
            } else {
                toast.success(`${label} saved as draft`);
            }
        }
        navigate(`/invoices/${id}`, { replace: true });
    };

    const validated = () => {
        const errors = validate(form, isEdit);
        setLocalErrors(errors);
        return Object.keys(errors).length === 0;
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        if (submitting || !validated()) return;
        if (isEdit && form.status === 'CANCELLED' && invoice.baseStatus !== 'CANCELLED') {
            setConfirmCancel(true);
            return;
        }
        save(isEdit ? undefined : 'ISSUED');
    };

    const saveDraft = () => {
        if (submitting || !validated()) return;
        save('DRAFT');
    };

    const total = liveTotal(form);
    const cancelTo = isEdit ? `/invoices/${invoice.id}` : prefillOrderId ? `/orders/${prefillOrderId}` : '/invoices';
    const prefillFailed = !isEdit && prefillOrderId && (prefill.status === 'error' || prefill.status === 'unavailable');
    const prefillOrder = !isEdit && prefill.order && form.order && form.order.id === prefill.order.id ? prefill.order : null;
    let amountHint;
    if (prefillOrder && prefill.unbilled !== null) {
        amountHint =
            prefill.unbilled > 0
                ? `Not yet billed on ${prefillOrder.orderNumber}: ${formatMoney(prefill.unbilled)}`
                : `${prefillOrder.orderNumber} is fully billed.`;
    }

    return (
        <FormLayout
            title={isEdit ? 'Edit invoice' : 'New invoice'}
            meta={isEdit ? invoice.invoiceNumber : undefined}
            description={isEdit ? undefined : 'Number is assigned when you save. Save and issue to record payments at once.'}
            error={[formError, prefillFailed && "Couldn't load the order to fill in this invoice. Choose the details below."]}
            onSubmit={handleSubmit}
            footer={
                isEdit ? (
                    <FormFooter submitLabel="Save" submitting={submitting} cancelTo={cancelTo} />
                ) : (
                    <FormFooter
                        submitLabel="Save and issue"
                        submitting={submitting && saving === 'ISSUED'}
                        cancelTo={cancelTo}
                        secondarySubmit={{ label: 'Save as draft', onClick: saveDraft, loading: submitting && saving === 'DRAFT' }}
                    />
                )
            }
        >
            <FormSection title="Billing">
                <ClientPicker
                    label="Billed to"
                    required
                    anyPerson
                    sheetTitle="Who are you billing?"
                    value={form.billedTo}
                    onChange={set('billedTo')}
                    loading={preselected.loading}
                    error={errorOf('billedTo')}
                    hint="A person or a company."
                />
                <OrderPicker
                    value={form.order}
                    onChange={set('order')}
                    error={errorOf('order')}
                    hint={!isEdit && prefill.status === 'loading' && prefillOrderId ? 'Loading the order…' : 'Optional. Choosing an order does not change billed to.'}
                />
            </FormSection>
            <FormSection title="Dates">
                <FormRow>
                    <DateField label="Invoice date" required value={form.invoiceDate} onChange={setInvoiceDate} error={errorOf('invoiceDate')} />
                    <DateField
                        label="Due date"
                        required
                        relative
                        value={form.dueDate}
                        onChange={setDueDate}
                        error={errorOf('dueDate')}
                        hint={isEdit ? undefined : `${DUE_AFTER_DAYS} days after the invoice date unless you change it.`}
                    />
                </FormRow>
            </FormSection>
            <FormSection title="Amount">
                <TextArea label="Description" rows={3} value={form.description} onChange={set('description')} error={errorOf('description')} />
                <FormRow>
                    <MoneyField label="Amount" required placeholder="0.00" value={form.amount} onChange={set('amount')} error={errorOf('amount')} hint={amountHint} />
                    <MoneyField label="Tax" placeholder="0.00" value={form.tax} onChange={set('tax')} error={errorOf('tax')} />
                </FormRow>
                <div className="flex items-baseline justify-between rounded-control border border-line bg-surface-subtle px-3 py-2.5">
                    <span className="text-sm text-ink-muted">Total (amount + tax)</span>
                    <span className="font-semibold text-ink tabular-nums">{total === null ? '—' : formatMoney(total)}</span>
                </div>
            </FormSection>
            {isEdit && (
                <FormSection title="Status">
                    <FormRow>
                        <SelectField
                            label="Status"
                            required
                            options={INVOICE_BASE_STATUSES}
                            value={form.status}
                            onChange={set('status')}
                            error={errorOf('status')}
                        />
                    </FormRow>
                </FormSection>
            )}
            <ConfirmDialog
                open={confirmCancel}
                title="Cancel this invoice?"
                text="It will no longer count as outstanding."
                confirmLabel="Cancel invoice"
                cancelLabel="Keep it"
                tone="danger"
                busy={submitting}
                onConfirm={() => save()}
                onCancel={() => setConfirmCancel(false)}
            />
        </FormLayout>
    );
}

function EditInvoice({ invoiceId }) {
    const invoice = useInvoice(invoiceId);
    return <DataView resource={invoice} skeleton="form" notFoundTitle="Invoice not found">{(i) => <InvoiceForm invoice={i} />}</DataView>;
}

/**
 * New invoice (/invoices/new, ?orderId= prefill, ?clientType=&clientId= preselect) and Edit invoice
 * (/invoices/:invoiceId/edit), F-06 / F-25. New: "Save as draft" or "Save and issue" (one create call). Online only.
 */
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
    const preselect = isEdit ? null : readClientPreselect(params);
    const formKey = [prefillOrderId, preselect && `${preselect.type}:${preselect.id}`].filter(Boolean).join('|') || 'new';
    const title = isEdit ? 'Edit invoice' : 'New invoice';

    if (!everOnline) {
        return (
            <PageBody width="form">
                <PageHeader backTo={isEdit ? `/invoices/${invoiceId}` : '/invoices'} backLabel={isEdit ? 'Invoice' : 'Invoices'} />
                <FormHeading title={title} />
                <EmptyState
                    icon="offline"
                    title="Adding and editing need a connection"
                    text="Connect to the internet and try again."
                    action={{ label: 'Go back', onClick: () => navigate(isEdit ? `/invoices/${invoiceId}` : '/invoices') }}
                />
            </PageBody>
        );
    }

    return (
        <PageBody width="form">
            <PageHeader backTo={isEdit ? `/invoices/${invoiceId}` : '/invoices'} backLabel={isEdit ? 'Invoice' : 'Invoices'} />
            {isEdit ? <EditInvoice invoiceId={invoiceId} /> : <InvoiceForm key={formKey} prefillOrderId={prefillOrderId} preselect={preselect} />}
        </PageBody>
    );
}
