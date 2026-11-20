import { useCallback } from 'react';
import { getPerson, listPeople } from '../api/people.js';
import useResource from './useResource.js';

/** All people, sorted by name. useResource shape: { status, data: Person[], fromCache, fetchedAt, error, reload }. */
export function usePeople() {
    return useResource('people', listPeople);
}

/** One person (detail, including `companies`). Pass null to skip loading. */
export function usePerson(id) {
    const fetcher = useCallback(({ signal }) => getPerson(id, { signal }), [id]);
    return useResource(id ? `person:${id}` : null, fetcher);
}

/**
 * The companies a person is linked to. The contract returns them inside the person detail
 * (`companies`), so this reads the same resource; `data` is the companies list.
 */
export function usePersonCompanies(id) {
    const person = usePerson(id);
    return { ...person, data: person.data ? person.data.companies || [] : person.data };
}
