import { Link, useParams } from 'react-router-dom';
import DataView from '../components/DataView.jsx';
import FactList from '../components/FactList.jsx';
import PageBody from '../components/PageBody.jsx';
import PageHeader from '../components/PageHeader.jsx';
import RecordHeader from '../components/RecordHeader.jsx';
import Section from '../components/Section.jsx';
import Tag from '../components/Tag.jsx';
import { Missing } from '../components/directory/directoryText.jsx';
import { UserStatus, YouTag } from '../components/users/UserRow.jsx';
import UsersOfflineState from '../components/users/UsersOfflineState.jsx';
import { roleLabel, workerName } from '../components/users/userStatus.js';
import useOnlineStatus from '../hooks/useOnlineStatus.js';
import useRole from '../hooks/useRole.js';
import { useUser } from '../hooks/useUsers.js';
import { formatDateTime } from '../utils/format.js';

const linkClass = 'text-ink underline-offset-2 hover:underline focus-visible:underline';
const pad = (n) => String(n).padStart(2, '0');

/** "Expires 16:45" today, "Expires 25 Nov 2026, 00:30" on another day. */
function expiresText(iso) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    const today = new Date().toDateString() === d.toDateString();
    return `Expires ${today ? `${pad(d.getHours())}:${pad(d.getMinutes())}` : formatDateTime(d)}`;
}

function temporaryPasswordText(user) {
    if (user.status === 'TEMP_PASSWORD_EXPIRED') return 'Expired';
    if (user.status === 'MUST_SET_PASSWORD' && user.temporaryPasswordExpiresAt) return expiresText(user.temporaryPasswordExpiresAt);
    return null;
}

/**
 * User detail (F-48 read part, admin only via the route guard): header with role tag, status badge
 * and "You"; facts Email, Worker and the temporary password expiry. Loaded from GET /auth/users
 * (no single-user endpoint). Online only. Edit, Reset password and Delete come with F-52, F-51, F-53.
 */
export default function UserDetailPage() {
    const { userId } = useParams();
    const { online } = useOnlineStatus();
    const { user: me } = useRole();
    const user = useUser(userId);
    const offline = !online || user.status === 'unavailable';

    return (
        <PageBody width="detail">
            <PageHeader backTo="/users" backLabel="Users" />
            {offline ? (
                <UsersOfflineState onRetry={user.reload} />
            ) : (
                <DataView resource={user} skeleton="detail" notFoundTitle="User not found">
                    {(u) => {
                        const isYou = Boolean(me) && me.id === u.id;
                        const facts = [
                            { label: 'Email', value: u.email, href: `mailto:${u.email}`, icon: 'email' },
                            {
                                label: 'Worker',
                                value: u.worker ? (
                                    <Link to={`/workers/${u.worker.id}`} className={linkClass}>
                                        {workerName(u)}
                                    </Link>
                                ) : (
                                    <Missing>No worker</Missing>
                                ),
                            },
                            { label: 'Temporary password', value: temporaryPasswordText(u) },
                        ];
                        return (
                            <>
                                <RecordHeader
                                    eyebrow={<Tag>User</Tag>}
                                    icon="PERSON"
                                    title={u.name}
                                    meta={[
                                        <Tag key="role">{roleLabel(u)}</Tag>,
                                        <UserStatus key="status" user={u} />,
                                        isYou ? <YouTag key="you" /> : null,
                                    ]}
                                />
                                <Section id="details" title="Details" flush={false}>
                                    <FactList items={facts} />
                                </Section>
                            </>
                        );
                    }}
                </DataView>
            )}
        </PageBody>
    );
}
