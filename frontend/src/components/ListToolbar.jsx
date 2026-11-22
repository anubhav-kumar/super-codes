import Menu from './Menu.jsx';
import SegmentedControl from './SegmentedControl.jsx';
import SummaryStrip from './SummaryStrip.jsx';

const SORT_TRIGGER =
    'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-control text-ink transition hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';

/**
 * Row under the top bar of a list: filter chips (with counts; scrolls sideways on phones), a sort
 * button on the right below lg (at lg+ the table headers sort), and an optional SummaryStrip below.
 *   const list = useListSort(SORTS, 'due');
 *   <ListToolbar
 *       filter={{ label: 'Status', options: [{ value, label, count, tone }], value, onChange }}
 *       sort={list}
 *       summary={[{ label: 'Outstanding', value: '₹8,108' }]}
 *   />
 */
export default function ListToolbar({ filter, sort, summary, className = '' }) {
    const sortItems = sort
        ? sort.options.map((o) => ({ label: o.label, checked: sort.key === o.value.replace(/^-/, ''), onSelect: () => sort.setSort(o.value) }))
        : [];

    return (
        <div className={`mb-3 flex flex-col gap-2 ${className}`}>
            {(filter || sort) && (
                <div className="flex items-center gap-2">
                    {filter && (
                        <SegmentedControl
                            label={filter.label}
                            options={filter.options}
                            value={filter.value}
                            onChange={filter.onChange}
                            bleed={!sort}
                            className="min-w-0 flex-1"
                        />
                    )}
                    {sort && sortItems.length > 1 && (
                        <div className={`${filter ? '' : 'ml-auto'} shrink-0 pb-1 lg:hidden`}>
                            <Menu
                                label={`Sort: ${sort.active ? sort.active.label : ''}`}
                                sheetTitle="Sort by"
                                icon="sort"
                                items={sortItems}
                                sheetOnPhone
                                triggerClassName={SORT_TRIGGER}
                            />
                        </div>
                    )}
                </div>
            )}
            {summary && <SummaryStrip items={summary} />}
        </div>
    );
}
