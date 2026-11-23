import { useMemo } from 'react';
import DataView from '../components/DataView.jsx';
import EmptyState from '../components/EmptyState.jsx';
import ListToolbar from '../components/ListToolbar.jsx';
import PageBody from '../components/PageBody.jsx';
import PageHeader from '../components/PageHeader.jsx';
import ResponsiveList from '../components/ResponsiveList.jsx';
import UserRow from '../components/users/UserRow.jsx';
import UsersOfflineState from '../components/users/UsersOfflineState.jsx';
import { userColumns } from '../components/users/userColumns.jsx';
import { USER_LIST_SORTS } from '../components/users/userStatus.js';
import useListFilter from '../hooks/useListFilter.js';
import useListSort from '../hooks/useListSort.js';
import useMediaQuery from '../hooks/useMediaQuery.js';
import useOnlineStatus from '../hooks/useOnlineStatus.js';
import useRole from '../hooks/useRole.js';
import { useUsers } from '../hooks/useUsers.js';

const SEARCH_FIELDS = ['name', 'email'];

/**
 * Users list (F-48, admin only via the route guard): every user with role, linked Worker and status;
 * two-line rows on phones, a table from 1024 px. Sorted by name, searched by name or email on the
 * device. Online only: offline it shows "Users needs a connection", never stale data.
 */
export default function UsersListPage() {
    const { online } = useOnlineStatus();
    const wide = useMediaQuery('(min-width: 1024px)');
    const { user: me } = useRole();
    const meId = me ? me.id : null;
    const users = useUsers();
    const list = useListSort(USER_LIST_SORTS, 'name');
    const { query, setQuery, filtered } = useListFilter(users.data, SEARCH_FIELDS);
    const rows = useMemo(() => filtered.slice().sort(list.compare), [filtered, list.compare]);
    const columns = useMemo(() => userColumns({ meId }), [meId]);
    const offline = !online || users.status === 'unavailable';

    return (
        <PageBody width="list">
            <PageHeader
                title="Users"
                search={!offline && users.data && users.data.length > 0 ? { value: query, onChange: setQuery, placeholder: 'Name or email', label: 'Search users by name or email' } : undefined}
            />
            {offline ? (
                <UsersOfflineState onRetry={users.reload} />
            ) : (
                <DataView resource={users} skeleton={wide ? 'table' : 'rows'}>
                    {(items) =>
                        !items || items.length === 0 ? (
                            <EmptyState icon="users" title="No users yet" />
                        ) : rows.length === 0 ? (
                            <EmptyState icon="search" title={`No matches for “${query.trim()}”`} action={{ label: 'Clear search', onClick: () => setQuery('') }} />
                        ) : (
                            <>
                                <ListToolbar sort={list} count={`${rows.length} ${rows.length === 1 ? 'user' : 'users'}`} className="lg:hidden" />
                                <ResponsiveList
                                    rows={rows}
                                    rowKey={(u) => u.id}
                                    table={{
                                        columns,
                                        rowHref: (u) => `/users/${u.id}`,
                                        sort: list.sort,
                                        onSortChange: list.setSort,
                                        caption: 'Users',
                                    }}
                                    renderRow={(u) => <UserRow user={u} isYou={u.id === meId} />}
                                />
                            </>
                        )
                    }
                </DataView>
            )}
        </PageBody>
    );
}
