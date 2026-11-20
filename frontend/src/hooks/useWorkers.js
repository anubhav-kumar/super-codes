import { getWorker, listWorkers } from '../api/workers.js';
import useResource from './useResource.js';

/** All workers (every page), for the list screen and pickers. */
export function useWorkers() {
    return useResource('workers', listWorkers);
}

/** One worker by id. */
export function useWorker(id) {
    return useResource(id ? `worker:${id}` : null, (opts) => getWorker(id, opts));
}
