/** Companies and person-company associations (backend contract P-02, F-03, service directory). */
import { request } from './client.js';

const PAGE_LIMIT = 500;
const companyPath = (id) => `/directory/companies/${encodeURIComponent(id)}`;

/**
 * GET /directory/companies, following nextToken until every page is loaded (filtered on the device).
 * Resolves to the client.js result shape with data = Company list item[] sorted by name.
 * Company list item (F-29) = Company + mainContact ({ personId, personName, personPhone, relationshipType }
 * or null), outstanding (INR, 0 when none) and hasOverdueInvoice; defaults fill them if absent.
 */
export async function listCompanies({ signal } = {}) {
    const items = [];
    let nextToken = null;
    let fromCache = false;
    let fetchedAt = null;
    do {
        const query = `limit=${PAGE_LIMIT}${nextToken ? `&nextToken=${encodeURIComponent(nextToken)}` : ''}`;
        const res = await request(`/directory/companies?${query}`, { signal });
        const page = res.data || {};
        if (Array.isArray(page.items)) {
            for (const item of page.items) {
                items.push({
                    ...item,
                    mainContact: item.mainContact || null,
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

/** GET /directory/companies/{id} -> Company detail (Company + associations sorted by person name). 404 NOT_FOUND. */
export function getCompany(id, { signal } = {}) {
    return request(companyPath(id), { signal });
}

/**
 * POST /directory/companies with a client-generated `id` and 1-20 association inputs, written in one
 * transaction. A retry with the same id returns the existing company (200). 409 PAN_TAKEN.
 */
export function createCompany(company) {
    return request('/directory/companies', { method: 'POST', body: company });
}

/** PUT /directory/companies/{id} with the full editable field set (no associations). */
export function updateCompany(id, fields) {
    return request(companyPath(id), { method: 'PUT', body: fields });
}

/**
 * POST /directory/companies/{id}/associations. input is { personId, relationshipType } or
 * { person: { id, name, phone, email }, relationshipType } (quick add). 409 ASSOCIATION_EXISTS.
 */
export function addAssociation(companyId, input) {
    return request(`${companyPath(companyId)}/associations`, { method: 'POST', body: input });
}

/** PUT /directory/companies/{id}/associations/{personId} { relationshipType }. */
export function updateAssociation(companyId, personId, relationshipType) {
    return request(`${companyPath(companyId)}/associations/${encodeURIComponent(personId)}`, {
        method: 'PUT',
        body: { relationshipType },
    });
}

/** DELETE /directory/companies/{id}/associations/{personId}. 409 LAST_ASSOCIATION. */
export function removeAssociation(companyId, personId) {
    return request(`${companyPath(companyId)}/associations/${encodeURIComponent(personId)}`, { method: 'DELETE' });
}
