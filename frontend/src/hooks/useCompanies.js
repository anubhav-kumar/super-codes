import { useCallback } from 'react';
import { getCompany, listCompanies } from '../api/companies.js';
import useResource from './useResource.js';

/** All companies, sorted by name. useResource shape: { status, data: Company[], fromCache, fetchedAt, error, reload }. */
export function useCompanies() {
    return useResource('companies', listCompanies);
}

/** One company (detail, including `associations`). Pass null to skip loading. */
export function useCompany(id) {
    const fetcher = useCallback(({ signal }) => getCompany(id, { signal }), [id]);
    return useResource(id ? `company:${id}` : null, fetcher);
}

/**
 * The people linked to a company. The contract returns them inside the company detail
 * (`associations`), so this reads the same resource; `data` is the Association[] list.
 */
export function useCompanyPeople(id) {
    const company = useCompany(id);
    return { ...company, data: company.data ? company.data.associations || [] : company.data };
}
