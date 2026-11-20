/** Orders (backend contract P-04, F-05, service orders). */
import { request } from './client.js';

const PAGE_LIMIT = 500;
const enc = encodeURIComponent;

/**
 * GET /orders, following nextToken until every page is loaded (status filter and search run on the
 * device, so one cached list serves every filter offline). Server order: newest order date first,
 * then highest order number. Resolves to the client.js result shape with data = Order[].
 */
export async function listOrders({ signal } = {}) {
    const items = [];
    let nextToken = null;
    let fromCache = false;
    let fetchedAt = null;
    do {
        const query = `limit=${PAGE_LIMIT}${nextToken ? `&nextToken=${enc(nextToken)}` : ''}`;
        const res = await request(`/orders?${query}`, { signal });
        const page = res.data || {};
        if (Array.isArray(page.items)) items.push(...page.items);
        nextToken = page.nextToken || null;
        fromCache = fromCache || res.fromCache;
        if (!fetchedAt || (res.fetchedAt && res.fetchedAt < fetchedAt)) fetchedAt = res.fetchedAt;
    } while (nextToken);
    return { data: items, fromCache, fetchedAt };
}

/** GET /orders/{id} -> Order detail (with assignments, primary first). 404 NOT_FOUND. */
export function getOrder(id, { signal } = {}) {
    return request(`/orders/${enc(id)}`, { signal });
}

/**
 * POST /orders with a client-generated UUID in body.id -> 201 Order detail with orderNumber
 * (200 with the existing order when that id already exists). Status is always NEW on create.
 */
export function createOrder(body) {
    return request('/orders', { method: 'POST', body });
}

/**
 * PUT /orders/{id} with the full editable field set, including status and the full desired
 * assignments list (may be []). Also used for the quick status change on the detail screen.
 */
export function updateOrder(id, body) {
    return request(`/orders/${enc(id)}`, { method: 'PUT', body });
}

const assignmentInput = (assignments) =>
    (assignments || []).map((a) => ({ workerId: a.workerId, isPrimary: Boolean(a.isPrimary) }));

/**
 * The full PUT body for an Order detail as loaded, with `changes` applied (e.g. { status }).
 * Keeps every field and the current assignments, so a quick status change clears nothing.
 */
export function orderUpdateBody(order, changes = {}) {
    return {
        serviceName: order.serviceName,
        clientType: order.client ? order.client.type : null,
        clientId: order.client ? order.client.id : null,
        receivedFromId: order.receivedFrom ? order.receivedFrom.id : null,
        orderDate: order.orderDate,
        description: order.description ?? null,
        amount: order.amount ?? null,
        status: order.status,
        dueDate: order.dueDate ?? null,
        notes: order.notes ?? null,
        assignments: assignmentInput(order.assignments),
        ...changes,
    };
}

const filteredItems = (res) => ({ ...res, data: (res.data && Array.isArray(res.data.items) && res.data.items) || [] });

/** GET /orders?clientId= (F-08, filtered, unpaginated) -> data = Order[] where this person/company is the client. */
export async function listClientOrders(clientId, { signal } = {}) {
    return filteredItems(await request(`/orders?clientId=${enc(clientId)}`, { signal }));
}

/**
 * GET /orders?receivedFromId= (F-08, filtered, unpaginated) -> data = Order[] this person requested.
 * Includes orders where the person is also the client; callers filter on client.type as needed.
 */
export async function listOrdersReceivedFrom(personId, { signal } = {}) {
    return filteredItems(await request(`/orders?receivedFromId=${enc(personId)}`, { signal }));
}
