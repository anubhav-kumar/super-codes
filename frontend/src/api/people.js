/** People (backend contract P-02, F-02, service directory). */
import { request } from './client.js';

const PAGE_LIMIT = 500;

/**
 * GET /directory/people, following nextToken until every page is loaded (the list is filtered on the device).
 * Resolves to the client.js result shape with data = Person list item[] sorted by name.
 * fromCache is true if any page came from the service worker cache; fetchedAt is the oldest page's time.
 * Person list item (F-29) = Person + companies [{ companyId, companyName, entityType, relationshipType }]
 * (first link first), outstanding (INR, 0 when none) and hasOverdueInvoice; defaults fill them if absent.
 */
export async function listPeople({ signal } = {}) {
    const items = [];
    let nextToken = null;
    let fromCache = false;
    let fetchedAt = null;
    do {
        const query = `limit=${PAGE_LIMIT}${nextToken ? `&nextToken=${encodeURIComponent(nextToken)}` : ''}`;
        const res = await request(`/directory/people?${query}`, { signal });
        const page = res.data || {};
        if (Array.isArray(page.items)) {
            for (const item of page.items) {
                items.push({
                    ...item,
                    companies: Array.isArray(item.companies) ? item.companies : [],
                    outstanding: Number(item.outstanding) || 0,
                    hasOverdueInvoice: item.hasOverdueInvoice === true,
                });
            }
        }
        nextToken = page.nextToken || null;
        fromCache = fromCache || res.fromCache;
        if (!fetchedAt || (res.fetchedAt && res.fetchedAt < fetchedAt)) fetchedAt = res.fetchedAt;
    } while (nextToken);
    items.sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'en', { sensitivity: 'base' }));
    return { data: items, fromCache, fetchedAt };
}

/** GET /directory/people/{id} -> Person detail (Person + companies). 404 NOT_FOUND. */
export function getPerson(id, { signal } = {}) {
    return request(`/directory/people/${encodeURIComponent(id)}`, { signal });
}

/**
 * POST /directory/people. `person.id` is a client-generated UUID v4; a retry with the same id
 * returns the existing person (200) instead of creating a duplicate. 409 PAN_TAKEN.
 */
export function createPerson(person) {
    return request('/directory/people', { method: 'POST', body: person });
}

/** PUT /directory/people/{id} with the full editable field set (omitted/null optional fields are cleared). */
export function updatePerson(id, fields) {
    return request(`/directory/people/${encodeURIComponent(id)}`, { method: 'PUT', body: fields });
}
