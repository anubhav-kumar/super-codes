import Badge from '../Badge.jsx';
import ClientIcon from '../ClientIcon.jsx';
import ListRow from '../ListRow.jsx';
import Tag from '../Tag.jsx';
import { Missing } from '../directory/directoryText.jsx';
import { roleLabel, userStatusLabel, userStatusTone, workerName } from './userStatus.js';

/** User status badge: Active (success), Must set new password (warning), Temporary password expired (danger). */
export function UserStatus({ user }) {
    return <Badge tone={userStatusTone(user.status)}>{userStatusLabel(user.status)}</Badge>;
}

/** Muted "You" tag on the signed-in admin's own row. */
export function YouTag({ className = '' }) {
    return <Tag className={className}>You</Tag>;
}

/** Name followed by the "You" tag when it is the signed-in user. */
export function UserName({ user, isYou }) {
    return (
        <span>
            {user.name}
            {isYou && <YouTag className="ml-2" />}
        </span>
    );
}

/**
 * Users list row on phones (F-48), like WorkerRow: person icon; line 1 name + "You", status badge
 * on the right; line 2 email · Admin|Member · Worker name (or "No worker").
 */
export default function UserRow({ user, isYou }) {
    return (
        <ListRow
            to={`/users/${user.id}`}
            leading={<ClientIcon type="PERSON" />}
            title={<UserName user={user} isYou={isYou} />}
            trailing={<UserStatus user={user} />}
            meta={[
                <span key="email" className="break-all">
                    {user.email}
                </span>,
                roleLabel(user),
                workerName(user) || <Missing key="worker">No worker</Missing>,
            ]}
        />
    );
}
