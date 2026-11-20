/** Invoices (backend contract P-05, F-06, service billing). */
import { request } from './client.js';

const PAGE_LIMIT = 500;
const enc = encodeURIComponent;

/**
 * GET /billing/invoices, following nextToken until every page is loaded (filters and search run on
 * the device, so one cached list serves every filter offline). Server order: newest invoice date
 * first, then highest invoice number. Resolves to the client.js result shape with data = Invoice[].
 */
export async function listInvoices({ signal } = {}) {
    const items = [];
    let nextToken = null;
    let fromCache = false;
    let fetchedAt = null;
    do {
        const query = `limit=${PAGE_LIMIT}${nextToken ? `&nextToken=${enc(nextToken)}` : ''}`;
        const res = await request(`/billing/invoices?${query}`, { signal });
        const page = res.data || {};
        if (Array.isArray(page.items)) items.push(...page.items);
        nextToken = page.nextToken || null;
        fromCache = fromCache || res.fromCache;
        if (!fetchedAt || (res.fetchedAt && res.fetchedAt < fetchedAt)) fetchedAt = res.fetchedAt;
    } while (nextToken);
    return { data: items, fromCache, fetchedAt };
}

/** GET /billing/invoices?orderId= (filtered, unpaginated) -> data = Invoice[] of that order. */
export async function listOrderInvoices(orderId, { signal } = {}) {
    const res = await request(`/billing/invoices?orderId=${enc(orderId)}`, { signal });
    return { ...res, data: (res.data && Array.isArray(res.data.items) && res.data.items) || [] };
}

/** GET /billing/invoices/{id} -> Invoice detail (with payments). 404 NOT_FOUND. */
export function getInvoice(id, { signal } = {}) {
    return request(`/billing/invoices/${enc(id)}`, { signal });
}

/**
 * POST /billing/invoices with a client-generated UUID in body.id -> 201 Invoice detail with
 * invoiceNumber and baseStatus DRAFT (200 with the existing invoice when that id already exists).
 */
export function createInvoice(body) {
    return request('/billing/invoices', { method: 'POST', body });
}

/** PUT /billing/invoices/{id} with the full editable field set, including baseStatus. */
export function updateInvoice(id, body) {
    return request(`/billing/invoices/${enc(id)}`, { method: 'PUT', body });
}
