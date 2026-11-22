import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import ClientPicker from '../components/ClientPicker.jsx';
import ComboField from '../components/ComboField.jsx';
import DataView from '../components/DataView.jsx';
import DateField from '../components/DateField.jsx';
import EmptyState from '../components/EmptyState.jsx';
import FormFooter from '../components/FormFooter.jsx';
import FormLayout, { FormHeading } from '../components/FormLayout.jsx';
import FormSection, { FormRow } from '../components/FormSection.jsx';
import MoneyField from '../components/MoneyField.jsx';
import PageBody from '../components/PageBody.jsx';
import PageHeader from '../components/PageHeader.jsx';
import PersonPicker, { pickedPersonId } from '../components/PersonPicker.jsx';
import SelectField from '../components/SelectField.jsx';
import TextArea from '../components/TextArea.jsx';
import WorkerAssignmentEditor from '../components/WorkerAssignmentEditor.jsx';
import { createOrder, updateOrder } from '../api/orders.js';
import { ORDER_LIMITS, ORDER_STATUSES, SERVICE_SUGGESTIONS } from '../constants/orders.js';
import { useCompanyPeople } from '../hooks/useCompanies.js';
import useOnlineStatus from '../hooks/useOnlineStatus.js';
import { useOrder } from '../hooks/useOrders.js';
import useSubmit from '../hooks/useSubmit.js';
import useToast from '../hooks/useToast.js';
import { todayLocal } from '../utils/dates.js';
import { parseMoney } from '../utils/validation.js';

const today = () => todayLocal();
const personValue = (p) => (p && p.id ? { type: 'existing', personId: p.id, name: p.name } : null);

function toForm(order) {
    if (!order) {
        return {
            serviceName: '',
            client: null,
            receivedFrom: null,
            receivedFromAuto: false,
            orderDate: today(),
            description: '',
            amount: '',
            dueDate: '',
            notes: '',
            status: 'NEW',
            assignments: [],
        };
    }
    const client = order.client && order.client.id ? { type: order.client.type, id: order.client.id, name: order.client.name } : null;
    const receivedFrom = personValue(order.receivedFrom);
    return {
        serviceName: order.serviceName || '',
        client,
        receivedFrom,
        // A person client who also requested the order counts as the auto-filled value.
        receivedFromAuto: Boolean(client && receivedFrom && client.type === 'PERSON' && client.id === receivedFrom.personId),
        orderDate: order.orderDate || '',
        description: order.description || '',
        amount: order.amount === null || order.amount === undefined ? '' : String(order.amount),
        dueDate: order.dueDate || '',
        notes: order.notes || '',
        status: order.status || 'NEW',
        assignments: (order.assignments || []).map((a) => ({
            workerId: a.workerId,
            workerName: a.workerName,
            workerStatus: a.workerStatus,
            isPrimary: Boolean(a.isPrimary),
        })),
    };
}

function validate(form, isEdit) {
    const errors = {};
    const service = form.serviceName.trim();
    if (!service) errors.serviceName = 'Enter the service';
    else if (service.length > ORDER_LIMITS.serviceName) errors.serviceName = `Service can be at most ${ORDER_LIMITS.serviceName} characters`;
    if (!form.client) errors.client = 'Choose a client';
    if (!form.receivedFrom) errors.receivedFrom = 'Choose who requested this';
    if (!form.orderDate) errors.orderDate = 'Enter the order date';
    const amount = parseMoney(form.amount);
    if (Number.isNaN(amount)) errors.amount = String(form.amount).trim().startsWith('-') ? 'Amount must be 0 or more' : 'Enter a valid amount, e.g. 15000.50';
    else if (amount !== null && amount > ORDER_LIMITS.maxAmount) errors.amount = 'Amount is too large';
    // Tagged assumption (frontend plan): a due date before the order date is blocked on the device.
    if (form.dueDate && form.orderDate && form.dueDate < form.orderDate) errors.dueDate = "Due date can't be before the order date";
    if (form.description.length > ORDER_LIMITS.description) errors.description = `Description can be at most ${ORDER_LIMITS.description} characters`;
    if (form.notes.length > ORDER_LIMITS.notes) errors.notes = `Notes can be at most ${ORDER_LIMITS.notes} characters`;
    if (form.assignments.length > 0 && form.assignments.filter((a) => a.isPrimary).length !== 1) errors.assignments = 'Choose a primary owner';
    if (isEdit && !form.status) errors.status = 'Choose a status';
    return errors;
}

// Full editable field set (PUT clears omitted optional fields, so every field is always sent).
function toBody(form, isEdit) {
    const opt = (v) => (v.trim() === '' ? null : v.trim());
    const body = {
        serviceName: form.serviceName.trim(),
        clientType: form.client.type,
        clientId: form.client.id,
        receivedFromId: pickedPersonId(form.receivedFrom),
        orderDate: form.orderDate,
        description: opt(form.description),
        amount: parseMoney(form.amount),
        dueDate: form.dueDate || null,
        notes: opt(form.notes),
        assignments: form.assignments.map((a) => ({ workerId: a.workerId, isPrimary: Boolean(a.isPrimary) })),
    };
    if (isEdit) body.status = form.status;
    return body;
}

// Server error fields (request body paths) -> form fields.
function serverError(fieldErrors, field) {
    const keys = {
        client: ['clientId', 'clientType'],
        receivedFrom: ['receivedFromId'],
    }[field] || [field];
    for (const k of keys) if (fieldErrors[k]) return fieldErrors[k];
    if (field === 'assignments') {
        const key = Object.keys(fieldErrors).find((k) => k.startsWith('assignments'));
        if (key) return fieldErrors[key];
    }
    return undefined;
}

function OrderForm({ order }) {
    const navigate = useNavigate();
    const isEdit = Boolean(order);
    // One id per form: a retried create after a dropped connection returns the same order (200).
    const newId = useRef(isEdit ? null : crypto.randomUUID());
    const [form, setForm] = useState(() => toForm(order));
    const [localErrors, setLocalErrors] = useState({});
    const { submit, submitting, formError, fieldErrors } = useSubmit({ errorToast: true });
    const toast = useToast();

    const companyId = form.client && form.client.type === 'COMPANY' ? form.client.id : null;
    const companyPeople = useCompanyPeople(companyId);
    const suggested =
        companyId && Array.isArray(companyPeople.data) && companyPeople.data.length
            ? { label: `People at ${form.client.name || 'this company'}`, ids: companyPeople.data.map((a) => a.personId) }
            : undefined;

    const clearError = (field) => {
        if (localErrors[field]) setLocalErrors((e) => ({ ...e, [field]: undefined }));
    };
    const set = (field) => (value) => {
        setForm((f) => ({ ...f, [field]: value }));
        clearError(field);
    };

    const setClient = (client) => {
        setForm((f) => {
            let { receivedFrom, receivedFromAuto } = f;
            // Reset "received from" only when it was empty or auto-filled from the previous client.
            if (!receivedFrom || receivedFromAuto) {
                if (client.type === 'PERSON') {
                    receivedFrom = { type: 'existing', personId: client.id, name: client.name };
                    receivedFromAuto = true;
                } else {
                    receivedFrom = null;
                    receivedFromAuto = false;
                }
            }
            return { ...f, client, receivedFrom, receivedFromAuto };
        });
        clearError('client');
        if (client.type === 'PERSON') clearError('receivedFrom');
    };
    const setReceivedFrom = (receivedFrom) => {
        setForm((f) => ({ ...f, receivedFrom, receivedFromAuto: false }));
        clearError('receivedFrom');
    };

    const errorOf = (field) => localErrors[field] || serverError(fieldErrors, field);

    const handleSubmit = async (e) => {
        e.preventDefault();
        const errors = validate(form, isEdit);
        setLocalErrors(errors);
        if (Object.keys(errors).length) return;
        const body = toBody(form, isEdit);
        const result = await submit(() => (isEdit ? updateOrder(order.id, body) : createOrder({ id: newId.current, ...body })));
        if (!result.ok) return;
        const id = isEdit ? order.id : newId.current;
        if (isEdit) {
            toast.success('Changes saved');
        } else {
            const number = result.data && result.data.orderNumber;
            toast.success(number ? `Order ${number} created` : 'Order created', {
                action: { label: 'Raise invoice', to: `/invoices/new?orderId=${encodeURIComponent(id)}` },
            });
        }
        navigate(`/orders/${id}`, { replace: true });
    };

    const cancelTo = isEdit ? `/orders/${order.id}` : '/orders';

    return (
        <FormLayout
            title={isEdit ? 'Edit order' : 'New order'}
            meta={isEdit ? order.orderNumber : undefined}
            description={isEdit ? undefined : 'Number is assigned when you save.'}
            error={formError}
            onSubmit={handleSubmit}
            footer={<FormFooter submitLabel={isEdit ? 'Save' : 'Create order'} submitting={submitting} cancelTo={cancelTo} />}
        >
            <FormSection title="Client">
                <ClientPicker
                    label="Client"
                    required
                    value={form.client}
                    onChange={setClient}
                    error={errorOf('client')}
                    hint="An individual client or a company."
                />
                <PersonPicker
                    label="Received from"
                    required
                    sheetTitle="Who requested this?"
                    value={form.receivedFrom}
                    onChange={setReceivedFrom}
                    suggested={suggested}
                    error={errorOf('receivedFrom')}
                    hint={form.client && form.client.type === 'COMPANY' ? 'People at the company are listed first.' : undefined}
                />
            </FormSection>
            <FormSection title="Work">
                <ComboField
                    label="Service"
                    required
                    maxLength={ORDER_LIMITS.serviceName}
                    suggestions={SERVICE_SUGGESTIONS}
                    value={form.serviceName}
                    onChange={set('serviceName')}
                    error={errorOf('serviceName')}
                    hint="Pick a suggestion or type your own."
                />
                <TextArea label="Description" rows={3} value={form.description} onChange={set('description')} error={errorOf('description')} />
                {isEdit && (
                    <FormRow>
                        <SelectField label="Status" required options={ORDER_STATUSES} value={form.status} onChange={set('status')} error={errorOf('status')} />
                    </FormRow>
                )}
            </FormSection>
            <FormSection title="Dates and amount">
                <FormRow>
                    <DateField label="Order date" required value={form.orderDate} onChange={set('orderDate')} error={errorOf('orderDate')} />
                    <DateField label="Due date" relative value={form.dueDate} onChange={set('dueDate')} error={errorOf('dueDate')} />
                </FormRow>
                <FormRow>
                    <MoneyField label="Amount" placeholder="0.00" value={form.amount} onChange={set('amount')} error={errorOf('amount')} />
                </FormRow>
            </FormSection>
            <FormSection title="Assignment">
                <WorkerAssignmentEditor value={form.assignments} onChange={set('assignments')} error={errorOf('assignments')} />
            </FormSection>
            <FormSection title="Notes">
                <TextArea label="Notes" rows={3} value={form.notes} onChange={set('notes')} error={errorOf('notes')} />
            </FormSection>
        </FormLayout>
    );
}

function EditOrder({ orderId }) {
    const order = useOrder(orderId);
    return <DataView resource={order} skeleton="form">{(o) => <OrderForm order={o} />}</DataView>;
}

/** New order (/orders/new) and Edit order (/orders/:orderId/edit), F-05. Online only. */
export default function OrderFormPage() {
    const { orderId } = useParams();
    const navigate = useNavigate();
    const { online } = useOnlineStatus();
    // A form opened while offline shows the "needs a connection" state until the app is online once.
    const [everOnline, setEverOnline] = useState(online);
    useEffect(() => {
        if (online) setEverOnline(true);
    }, [online]);

    const isEdit = Boolean(orderId);
    const title = isEdit ? 'Edit order' : 'New order';

    if (!everOnline) {
        return (
            <PageBody width="form">
                <PageHeader backTo={isEdit ? `/orders/${orderId}` : '/orders'} backLabel={isEdit ? 'Order' : 'Orders'} />
                <FormHeading title={title} />
                <EmptyState
                    icon="offline"
                    title="Adding and editing need a connection"
                    text="Connect to the internet and try again."
                    action={{ label: 'Go back', onClick: () => navigate(isEdit ? `/orders/${orderId}` : '/orders') }}
                />
            </PageBody>
        );
    }

    return (
        <PageBody width="form">
            <PageHeader backTo={isEdit ? `/orders/${orderId}` : '/orders'} backLabel={isEdit ? 'Order' : 'Orders'} />
            {isEdit ? <EditOrder orderId={orderId} /> : <OrderForm />}
        </PageBody>
    );
}
