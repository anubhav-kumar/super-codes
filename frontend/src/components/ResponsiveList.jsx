import useMediaQuery from '../hooks/useMediaQuery.js';
import DataTable from './DataTable.jsx';

/**
 * One list, two layouts: DataTable at lg+ (1024 px), two-line rows below. Only one tree renders.
 *   <ResponsiveList
 *       rows={sorted} rowKey={(o) => o.id}
 *       table={{ columns, rowHref: (o) => `/orders/${o.id}`, sort: list.sort, onSortChange: list.setSort, caption: 'Orders' }}
 *       renderRow={(o) => <OrderRow order={o} />}
 *   />
 */
export default function ResponsiveList({ rows, rowKey, table, renderRow, className = '' }) {
    const wide = useMediaQuery('(min-width: 1024px)');
    if (wide && table) return <DataTable rows={rows} rowKey={rowKey} {...table} className={className} />;
    return (
        <ul className={`divide-y divide-line overflow-hidden rounded-card border border-line bg-surface ${className}`}>
            {rows.map((row) => (
                <li key={rowKey(row)}>{renderRow(row)}</li>
            ))}
        </ul>
    );
}
