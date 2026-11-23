import { useMemo } from 'react';
import Button from '../components/Button.jsx';
import ClientsTabs from '../components/ClientsTabs.jsx';
import DataView from '../components/DataView.jsx';
import EmptyState from '../components/EmptyState.jsx';
import ListToolbar from '../components/ListToolbar.jsx';
import NoWorkerState from '../components/NoWorkerState.jsx';
import OfflineActionHint from '../components/OfflineActionHint.jsx';
import PageBody from '../components/PageBody.jsx';
import PageHeader from '../components/PageHeader.jsx';
import ResponsiveList from '../components/ResponsiveList.jsx';
import PersonRow from '../components/directory/PersonRow.jsx';
import { ADD_BUTTON_CLASS, CLIENTS_TABS_CLASS } from '../components/directory/clientsHeader.js';
import { PEOPLE_COLUMNS } from '../components/directory/directoryColumns.jsx';
import { CLIENT_LIST_SORTS } from '../constants/clients.js';
import useListFilter from '../hooks/useListFilter.js';
import useListSort from '../hooks/useListSort.js';
import useMediaQuery from '../hooks/useMediaQuery.js';
import useOnlineStatus from '../hooks/useOnlineStatus.js';
import { usePeople } from '../hooks/usePeople.js';
import useRole from '../hooks/useRole.js';

const companyNames = (person) => person.companies.map((c) => c.companyName || '').join(' ');
const SEARCH_FIELDS = ['name', 'pan', 'phone', companyNames];

/**
 * People list (F-02, F-29): two-line rows with company link or PAN and phone, and outstanding money
 * (red only when an invoice is overdue); a sortable table from 1024 px. Search by name, PAN, phone
 * (and company name) on the device. Members (P-26 F-55): no Add person; the backend sends only the
 * clients of their orders; empty list says so, or shows NoWorkerState without a linked Worker.
 */
export default function PeopleListPage() {
    const { online } = useOnlineStatus();
    const { isAdmin, hasWorker } = useRole();
    const wide = useMediaQuery('(min-width: 1024px)');
    const people = usePeople();
    const list = useListSort(CLIENT_LIST_SORTS, 'name');
    const { query, setQuery, filtered } = useListFilter(people.data, SEARCH_FIELDS);
    const rows = useMemo(() => filtered.slice().sort(list.compare), [filtered, list.compare]);

    return (
        <PageBody width="list">
            <PageHeader
                title="People"
                titleSlot={<ClientsTabs value="/people" className={CLIENTS_TABS_CLASS} />}
                search={people.data && people.data.length > 0 ? { value: query, onChange: setQuery, placeholder: 'Name, PAN, phone', label: 'Search people by name, PAN, phone or company' } : undefined}
                actions={
                    isAdmin && (
                        <Button icon="plus" to="/people/new" disabled={!online} aria-label="Add person" className={ADD_BUTTON_CLASS}>
                            <span className="md:hidden">Add</span>
                            <span className="hidden md:inline">Add person</span>
                        </Button>
                    )
                }
            />
            {isAdmin && !online && <OfflineActionHint className="mb-4" />}

            <DataView resource={people} skeleton={wide ? 'table' : 'rows'}>
                {(items) =>
                    !items || items.length === 0 ? (
                        !isAdmin && !hasWorker ? (
                            <NoWorkerState />
                        ) : !isAdmin ? (
                            <EmptyState icon="clients" title="No clients yet" text="Clients of your orders show here." />
                        ) : (
                            <EmptyState
                                icon="clients"
                                title="No people yet"
                                text="Add the individual clients and company contacts the firm works with."
                                action={online ? { label: 'Add person', to: '/people/new', icon: 'plus' } : undefined}
                            />
                        )
                    ) : rows.length === 0 ? (
                        <EmptyState
                            icon="search"
                            title={`No matches for “${query.trim()}”`}
                            action={{ label: 'Clear search', onClick: () => setQuery('') }}
                        />
                    ) : (
                        <>
                            <ListToolbar sort={list} count={`${rows.length} ${rows.length === 1 ? 'person' : 'people'}`} className="lg:hidden" />
                            <ResponsiveList
                                rows={rows}
                                rowKey={(p) => p.id}
                                table={{
                                    columns: PEOPLE_COLUMNS,
                                    rowHref: (p) => `/people/${p.id}`,
                                    sort: list.sort,
                                    onSortChange: list.setSort,
                                    caption: 'People',
                                }}
                                renderRow={(p) => <PersonRow person={p} />}
                            />
                        </>
                    )
                }
            </DataView>
        </PageBody>
    );
}
