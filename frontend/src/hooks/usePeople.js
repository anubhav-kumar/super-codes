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
