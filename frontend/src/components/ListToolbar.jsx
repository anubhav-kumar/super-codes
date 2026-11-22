import Icon from './Icon.jsx';
import Menu from './Menu.jsx';
import SegmentedControl from './SegmentedControl.jsx';
import SummaryStrip from './SummaryStrip.jsx';

// Sort-only caption mode: a text button with a 44 px hit area (the visible text stays 14 px); -mr-2
// lines the chevron up with the page gutter.
const SORT_TEXT_TRIGGER =
    'inline-flex h-11 items-center gap-1 -mr-2 rounded-control px-2 text-sm text-ink-muted transition hover:bg-surface-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';

const SORT_TRIGGER =
    'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-control text-ink transition hover:bg-surface-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';

/**
 * Row under the top bar of a list: filter chips (with counts; scrolls sideways on phones), a sort
 * button on the right below lg (at lg+ the table headers sort), and an optional SummaryStrip below.
 * Without `filter` (People, Companies; F-34) the sort does not get a row of its own: one 44 px
 * caption line with the optional `count` text on the left ("12 people") and a "Sorted by Name"
 * text button on the right that opens the same Sort by sheet / menu.
 *   const list = useListSort(SORTS, 'due');
 *   <ListToolbar
 *       filter={{ label: 'Status', options: [{ value, label, count, tone }], value, onChange }}
 *       sort={list}
 *       summary={[{ label: 'Outstanding', value: '₹8,108' }]}
 *   />
 */
export default function ListToolbar({ filter, sort, summary, count, className = '' }) {
    const sortItems = sort
        ? sort.options.map((o) => ({ label: o.label, checked: sort.key === o.value.replace(/^-/, ''), onSelect: () => sort.setSort(o.value) }))
        : [];
    const canSort = sort && sortItems.length > 1;

    if (!filter && (canSort || count)) {
        const current = sort && sort.active ? sort.active.label : '';
        return (
            <div className={`mb-1 flex flex-col ${className}`}>
                <div className="flex h-11 items-center justify-between gap-2">
                    <span className="min-w-0 truncate text-sm text-ink-muted">{count}</span>
                    {canSort && (
                        <Menu
                            label={`Sort, currently ${current}`}
                            sheetTitle="Sort by"
                            items={sortItems}
                            sheetOnPhone
                            triggerClassName={SORT_TEXT_TRIGGER}
                            className="shrink-0"
                            trigger={
                                <>
                                    <span>
                                        Sorted by <span className="font-semibold text-ink">{current}</span>
                                    </span>
                                    <Icon name="chevron-down" size="sm" />
                                </>
                            }
                        />
                    )}
                </div>
                {summary && <SummaryStrip items={summary} className="mb-2" />}
            </div>
        );
    }

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
