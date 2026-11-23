import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import Button from '../components/Button.jsx';
import DataView from '../components/DataView.jsx';
import EmptyState from '../components/EmptyState.jsx';
import ListToolbar from '../components/ListToolbar.jsx';
import OfflineActionHint from '../components/OfflineActionHint.jsx';
import PageBody from '../components/PageBody.jsx';
import PageHeader from '../components/PageHeader.jsx';
import ResponsiveList from '../components/ResponsiveList.jsx';
import WorkerRow from '../components/directory/WorkerRow.jsx';
import { workerColumns } from '../components/directory/workerColumns.jsx';
import { designationLabel, WORKER_FILTERS, WORKER_LIST_SORTS } from '../constants/workers.js';
import useListFilter from '../hooks/useListFilter.js';
import useListSort from '../hooks/useListSort.js';
import useMediaQuery from '../hooks/useMediaQuery.js';
import useOnlineStatus from '../hooks/useOnlineStatus.js';
import { useWorkers } from '../hooks/useWorkers.js';

const EMPTY_FILTER_TEXT = { ACTIVE: 'No active workers.', INACTIVE: 'No inactive workers.' };
const SEARCH_FIELDS = ['name', 'phone', (w) => designationLabel(w.designation)];

/**
 * Workers list (F-04, F-30): Active / Inactive / All chips with counts (default Active), two-line rows
 * with the open order count, a sortable table from 1024 px (Name, Open orders). Search by name,
 * phone and designation on the device.
 */
export default function WorkersListPage() {
    const { online } = useOnlineStatus();
    const wide = useMediaQuery('(min-width: 1024px)');
    const workers = useWorkers();
    const [params, setParams] = useSearchParams();
    const requested = params.get('status');
    const filter = WORKER_FILTERS.some((f) => f.value === requested) ? requested : 'ACTIVE';
    const list = useListSort(WORKER_LIST_SORTS, 'name');

    const setFilter = (value) => {
        setParams(
            (prev) => {
                const next = new URLSearchParams(prev);
                if (value === 'ACTIVE') next.delete('status');
                else next.set('status', value);
                return next;
            },
            { replace: true }
        );
    };

    const all = useMemo(() => workers.data || [], [workers.data]);
    const filterOptions = useMemo(
        () =>
            WORKER_FILTERS.map((f) => ({
                ...f,
                count: f.value === 'ALL' ? all.length : all.filter((w) => w.status === f.value).length,
            })),
        [all]
    );
    const byStatus = useMemo(() => (filter === 'ALL' ? all : all.filter((w) => w.status === filter)), [all, filter]);

    // Search lives in the top bar, so it is filtered here and passed to the rows.
    const { query, setQuery, filtered } = useListFilter(byStatus, SEARCH_FIELDS);
    const rows = useMemo(() => filtered.slice().sort(list.compare), [filtered, list.compare]);
    const hideActive = filter === 'ACTIVE';
    const columns = useMemo(() => workerColumns({ hideStatus: hideActive }), [hideActive]);

    return (
        <PageBody width="list">
            <PageHeader
                title="Workers"
                search={all.length > 0 ? { value: query, onChange: setQuery, placeholder: 'Name or phone', label: 'Search workers by name, phone or designation' } : undefined}
                actions={
                    <Button icon="plus" to="/workers/new" disabled={!online} aria-label="Add worker">
                        <span className="md:hidden">Add</span>
                        <span className="hidden md:inline">Add worker</span>
                    </Button>
                }
            />
            {!online && <OfflineActionHint className="mb-4" />}
            <DataView resource={workers} skeleton={wide ? 'table' : 'rows'}>
                {(data) =>
                    !data || data.length === 0 ? (
                        <EmptyState
                            icon="workers"
                            title="No workers yet"
                            text="Add the people in your firm so orders can be assigned to them."
                            action={online ? { label: 'Add worker', to: '/workers/new', icon: 'plus' } : undefined}
                        />
                    ) : (
                        <>
                            <ListToolbar filter={{ label: 'Status', options: filterOptions, value: filter, onChange: setFilter }} sort={list} />
                            {rows.length === 0 ? (
                                query.trim() ? (
                                    <EmptyState
                                        icon="search"
                                        title={`No matches for “${query.trim()}”`}
                                        action={{ label: 'Clear search', onClick: () => setQuery('') }}
                                    />
                                ) : (
                                    <EmptyState icon="workers" title={EMPTY_FILTER_TEXT[filter] || 'No workers.'} />
                                )
                            ) : (
                                <ResponsiveList
                                    rows={rows}
                                    rowKey={(w) => w.id}
                                    table={{
                                        columns,
                                        rowHref: (w) => `/workers/${w.id}`,
                                        sort: list.sort,
                                        onSortChange: list.setSort,
                                        caption: 'Workers',
                                    }}
                                    renderRow={(w) => <WorkerRow worker={w} hideActive={hideActive} />}
                                />
                            )}
                        </>
                    )
                }
            </DataView>
        </PageBody>
    );
}
