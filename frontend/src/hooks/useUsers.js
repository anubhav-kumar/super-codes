import { getUser, listUsers } from '../api/users.js';
import useResource from './useResource.js';

/** All users (admin only, online only). */
export function useUsers() {
    return useResource('users', listUsers);
}

/** One user by id, found in the users list (there is no single-user endpoint). */
export function useUser(id) {
    return useResource(id ? `user:${id}` : null, (opts) => getUser(id, opts));
}
