import Tag from '../components/Tag.jsx';
import Button from '../components/Button.jsx';
import ClientsTabs from '../components/ClientsTabs.jsx';
import DataView from '../components/DataView.jsx';
import EmptyState from '../components/EmptyState.jsx';
import ListItem from '../components/ListItem.jsx';
import OfflineActionHint from '../components/OfflineActionHint.jsx';
import PageBody from '../components/PageBody.jsx';
import PageHeader from '../components/PageHeader.jsx';
import useListFilter from '../hooks/useListFilter.js';
import useOnlineStatus from '../hooks/useOnlineStatus.js';
import { usePeople } from '../hooks/usePeople.js';

const SEARCH_FIELDS = ['name', 'pan', 'phone'];

/** People list (F-02): search by name, PAN or phone; rows sorted by name. */
export default function PeopleListPage() {
    const { online } = useOnlineStatus();
    const people = usePeople();
    const { query, setQuery, filtered } = useListFilter(people.data, SEARCH_FIELDS);

    return (
        <PageBody width="list">
            <PageHeader
                title="People"
                titleSlot={<ClientsTabs value="/people" />}
                search={people.data && people.data.length > 0 ? { value: query, onChange: setQuery, placeholder: 'Search name, PAN or phone' } : undefined}
                actions={
                    <Button icon="plus" to="/people/new" disabled={!online} aria-label="Add person">
                        <span className="md:hidden">Add</span>
                        <span className="hidden md:inline">Add person</span>
                    </Button>
                }
            />
            {!online && <OfflineActionHint className="mb-4" />}

            <DataView resource={people} skeleton="rows">
                {(items) =>
                    !items || items.length === 0 ? (
                        <EmptyState
                            icon="clients"
                            title="No people yet"
                            text="Add the individual clients and company contacts the firm works with."
                            action={online ? { label: 'Add person', to: '/people/new', icon: 'plus' } : undefined}
                        />
                    ) : (
                        <>
                            {filtered.length === 0 ? (
                                <EmptyState
                                    icon="search"
                                    title={`No matches for “${query.trim()}”`}
                                    action={{ label: 'Clear search', onClick: () => setQuery('') }}
                                />
                            ) : (
                                <ul className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
                                    {filtered.map((person) => (
                                        <li key={person.id}>
                                            <ListItem
                                                to={`/people/${person.id}`}
                                                title={person.name}
                                                subtitle={person.phone || undefined}
                                                badges={person.isIndividualClient ? <Tag>Individual client</Tag> : undefined}
                                            />
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </>
                    )
                }
            </DataView>
        </PageBody>
    );
}
