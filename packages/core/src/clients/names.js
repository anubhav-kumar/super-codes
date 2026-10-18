import { listUsers } from '../users/repo.js';

// F4: userId → { userId, name } for author / editor fields. One Users scan per call, which is
// fine at trial volume (the chat list already does the same).
export async function loadUserNames() {
  const users = await listUsers();
  return new Map(users.map((u) => [u.userId, u.name]));
}

export function userRef(names, userId) {
  if (!userId) return null;
  return { userId, name: names.get(userId) ?? userId };
}
