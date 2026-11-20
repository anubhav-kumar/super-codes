import Button from '../components/Button.jsx';
import ClientsTabs from '../components/ClientsTabs.jsx';
import DataView from '../components/DataView.jsx';
import EmptyState from '../components/EmptyState.jsx';
import ListItem from '../components/ListItem.jsx';
import OfflineActionHint from '../components/OfflineActionHint.jsx';
import PageHeader from '../components/PageHeader.jsx';
import SearchInput from '../components/SearchInput.jsx';
import { entityTypeLabel } from '../constants/clients.js';
import { useCompanies } from '../hooks/useCompanies.js';
import useListFilter from '../hooks/useListFilter.js';
import useOnlineStatus from '../hooks/useOnlineStatus.js';

const SEARCH_FIELDS = ['name', 'pan'];

/** Companies list (F-03): search by name or PAN; rows sorted by name. */
export default function CompaniesListPage() {
    const { online } = useOnlineStatus();
    const companies = useCompanies();
    const { query, setQuery, filtered } = useListFilter(companies.data, SEARCH_FIELDS);

    return (
        <>
            <ClientsTabs value="/companies" className="mb-4" />
            <PageHeader
                title="Companies"
                actions={
                    <Button icon="plus" to="/companies/new" disabled={!online}>
                        Add company
                    </Button>
                }
            />
            {!online && <OfflineActionHint className="-mt-2 mb-4" />}

            <DataView resource={companies}>
                {(items) =>
                    !items || items.length === 0 ? (
                        <EmptyState
                            icon="clients"
                            title="No companies yet"
                            text="Add the companies the firm works for, with the people who represent them."
                            action={online ? { label: 'Add company', to: '/companies/new', icon: 'plus' } : undefined}
                        />
                    ) : (
                        <>
                            <SearchInput value={query} onChange={setQuery} placeholder="Search name or PAN" className="mb-3" />
                            {filtered.length === 0 ? (
                                <EmptyState
                                    icon="search"
                                    title={`No matches for “${query.trim()}”`}
                                    action={{ label: 'Clear search', onClick: () => setQuery('') }}
                                />
                            ) : (
                                <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
                                    {filtered.map((company) => (
                                        <li key={company.id}>
                                            <ListItem
                                                to={`/companies/${company.id}`}
                                                title={company.name}
                                                subtitle={entityTypeLabel(company.entityType)}
                                                meta={company.pan ? <span className="font-mono">{company.pan}</span> : undefined}
                                            />
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </>
                    )
                }
            </DataView>
        </>
    );
}
