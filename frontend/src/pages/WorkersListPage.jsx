import { useSearchParams } from 'react-router-dom';
import Badge from '../components/Badge.jsx';
import Button from '../components/Button.jsx';
import DataView from '../components/DataView.jsx';
import EmptyState from '../components/EmptyState.jsx';
import ListItem from '../components/ListItem.jsx';
import OfflineActionHint from '../components/OfflineActionHint.jsx';
import PageBody from '../components/PageBody.jsx';
import PageHeader from '../components/PageHeader.jsx';
import SegmentedControl from '../components/SegmentedControl.jsx';
import { designationLabel, WORKER_FILTERS, WORKER_STATUS_TONE, workerStatusLabel } from '../constants/workers.js';
import useListFilter from '../hooks/useListFilter.js';
import useOnlineStatus from '../hooks/useOnlineStatus.js';
import { useWorkers } from '../hooks/useWorkers.js';

const EMPTY_FILTER_TEXT = { ACTIVE: 'No active workers.', INACTIVE: 'No inactive workers.' };

function WorkerRows({ workers, filtered, query, setQuery, filter, addDisabled }) {

    if (workers.length === 0) {
        return (
            <EmptyState
                icon="workers"
                title="No workers yet"
                text="Add the people in your firm so orders can be assigned to them."
                action={addDisabled ? undefined : { label: 'Add worker', to: '/workers/new', icon: 'plus' }}
            />
        );
    }

    return (
        <>
            {filtered.length === 0 ? (
                query ? (
                    <EmptyState
                        icon="search"
                        title={`No matches for “${query}”`}
                        action={{ label: 'Clear search', onClick: () => setQuery('') }}
                    />
                ) : (
                    <EmptyState icon="workers" title={EMPTY_FILTER_TEXT[filter] || 'No workers.'} />
                )
            ) : (
                <div className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface">
                    {filtered.map((w) => (
                        <ListItem
                            key={w.id}
                            to={`/workers/${w.id}`}
                            title={w.name}
                            subtitle={designationLabel(w.designation)}
                            badges={<Badge tone={WORKER_STATUS_TONE[w.status]}>{workerStatusLabel(w.status)}</Badge>}
                        />
                    ))}
                </div>
            )}
        </>
    );
}

/** Workers list (F-04): Active / Inactive / All filter (default Active) and name search, both on the device. */
export default function WorkersListPage() {
    const { online } = useOnlineStatus();
    const workers = useWorkers();
    const [params, setParams] = useSearchParams();
    const requested = params.get('status');
    const filter = WORKER_FILTERS.some((f) => f.value === requested) ? requested : 'ACTIVE';

    const setFilter = (value) => {
        const next = new URLSearchParams(params);
        if (value === 'ACTIVE') next.delete('status');
        else next.set('status', value);
        setParams(next, { replace: true });
    };

    // Search lives in the top bar, so it is filtered here and passed to the rows.
    const all = workers.data || [];
    const byStatus = filter === 'ALL' ? all : all.filter((w) => w.status === filter);
    const { query, setQuery, filtered } = useListFilter(byStatus, ['name']);

    return (
        <PageBody width="list">
            <PageHeader
                title="Workers"
                search={all.length > 0 ? { value: query, onChange: setQuery, placeholder: 'Search name' } : undefined}
                actions={
                    <Button icon="plus" to="/workers/new" disabled={!online} aria-label="Add worker">
                        <span className="md:hidden">Add</span>
                        <span className="hidden md:inline">Add worker</span>
                    </Button>
                }
            />
            {!online && <OfflineActionHint className="mb-4" />}
            <SegmentedControl label="Status" options={WORKER_FILTERS} value={filter} onChange={setFilter} className="mb-3" />
            <DataView resource={workers}>
                {(data) => (
                    <WorkerRows workers={data || []} filtered={filtered} query={query} setQuery={setQuery} filter={filter} addDisabled={!online} />
                )}
            </DataView>
        </PageBody>
    );
}
