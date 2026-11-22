import { useMemo } from 'react';
import Button from '../components/Button.jsx';
import ClientsTabs from '../components/ClientsTabs.jsx';
import DataView from '../components/DataView.jsx';
import EmptyState from '../components/EmptyState.jsx';
import ListToolbar from '../components/ListToolbar.jsx';
import OfflineActionHint from '../components/OfflineActionHint.jsx';
import PageBody from '../components/PageBody.jsx';
import PageHeader from '../components/PageHeader.jsx';
import ResponsiveList from '../components/ResponsiveList.jsx';
import CompanyRow from '../components/directory/CompanyRow.jsx';
import { ADD_BUTTON_CLASS, CLIENTS_TABS_CLASS } from '../components/directory/clientsHeader.js';
import { COMPANY_COLUMNS } from '../components/directory/directoryColumns.jsx';
import { CLIENT_LIST_SORTS } from '../constants/clients.js';
import { useCompanies } from '../hooks/useCompanies.js';
import useListFilter from '../hooks/useListFilter.js';
import useListSort from '../hooks/useListSort.js';
import useMediaQuery from '../hooks/useMediaQuery.js';
import useOnlineStatus from '../hooks/useOnlineStatus.js';

const contactName = (company) => (company.mainContact && company.mainContact.personName) || '';
const SEARCH_FIELDS = ['name', 'pan', 'phone', contactName];

/**
 * Companies list (F-03, F-29): two-line rows with entity type, main contact and outstanding money
 * (red only when an invoice is overdue); a sortable table from 1024 px. Search by name, PAN, phone
 * (and main contact) on the device.
 */
export default function CompaniesListPage() {
    const { online } = useOnlineStatus();
    const wide = useMediaQuery('(min-width: 1024px)');
    const companies = useCompanies();
    const list = useListSort(CLIENT_LIST_SORTS, 'name');
    const { query, setQuery, filtered } = useListFilter(companies.data, SEARCH_FIELDS);
    const rows = useMemo(() => filtered.slice().sort(list.compare), [filtered, list.compare]);

    return (
        <PageBody width="list">
            <PageHeader
                title="Companies"
                titleSlot={<ClientsTabs value="/companies" className={CLIENTS_TABS_CLASS} />}
                search={companies.data && companies.data.length > 0 ? { value: query, onChange: setQuery, placeholder: 'Search name, PAN or phone' } : undefined}
                actions={
                    <Button icon="plus" to="/companies/new" disabled={!online} aria-label="Add company" className={ADD_BUTTON_CLASS}>
                        <span className="md:hidden">Add</span>
                        <span className="hidden md:inline">Add company</span>
                    </Button>
                }
            />
            {!online && <OfflineActionHint className="mb-4" />}

            <DataView resource={companies} skeleton={wide ? 'table' : 'rows'}>
                {(items) =>
                    !items || items.length === 0 ? (
                        <EmptyState
                            icon="clients"
                            title="No companies yet"
                            text="Add the companies the firm works for, with the people who represent them."
                            action={online ? { label: 'Add company', to: '/companies/new', icon: 'plus' } : undefined}
                        />
                    ) : rows.length === 0 ? (
                        <EmptyState
                            icon="search"
                            title={`No matches for “${query.trim()}”`}
                            action={{ label: 'Clear search', onClick: () => setQuery('') }}
                        />
                    ) : (
                        <>
                            <ListToolbar sort={list} className="lg:hidden" />
                            <ResponsiveList
                                rows={rows}
                                rowKey={(c) => c.id}
                                table={{
                                    columns: COMPANY_COLUMNS,
                                    rowHref: (c) => `/companies/${c.id}`,
                                    sort: list.sort,
                                    onSortChange: list.setSort,
                                    caption: 'Companies',
                                }}
                                renderRow={(c) => <CompanyRow company={c} />}
                            />
                        </>
                    )
                }
            </DataView>
        </PageBody>
    );
}
