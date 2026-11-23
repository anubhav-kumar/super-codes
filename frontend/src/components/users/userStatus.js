import { compareText } from '../../hooks/useListSort.js';

/** User status labels and Badge tones (FR1 D13, D18). */
export const USER_STATUS = {
    ACTIVE: { label: 'Active', tone: 'success' },
    MUST_SET_PASSWORD: { label: 'Must set new password', tone: 'warning' },
    TEMP_PASSWORD_EXPIRED: { label: 'Temporary password expired', tone: 'danger' },
};

export const userStatusLabel = (status) => (USER_STATUS[status] || {}).label || status || '';
export const userStatusTone = (status) => (USER_STATUS[status] || {}).tone || 'neutral';

/** "Admin" / "Member": a neutral Tag, never colored (not a status). */
export const roleLabel = (user) => (user.isAdmin ? 'Admin' : 'Member');

/** Linked Worker name; null when unlinked, "Unknown worker" when the Worker record is missing. */
export const workerName = (user) => (user.worker ? user.worker.name || 'Unknown worker' : null);

/** Sort options of the Users list (useListSort). The list arrives sorted by name, then email. */
export const USER_LIST_SORTS = [{ value: 'name', label: 'Name', compare: compareText((u) => u.name) }];
