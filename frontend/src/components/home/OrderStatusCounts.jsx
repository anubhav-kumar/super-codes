import { Link } from 'react-router-dom';
import { ORDER_STATUSES } from '../../constants/orders.js';
import Icon from '../Icon.jsx';
import Section from '../Section.jsx';

// Display order on Home: the work pipeline, then the closed statuses.
const ORDER = ['NEW', 'ACCEPTED', 'IN_PROGRESS', 'ON_HOLD', 'COMPLETED', 'CANCELLED'];
const LABELS = Object.fromEntries(ORDER_STATUSES.map((s) => [s.value, s.label]));
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

/**
 * "My orders by status" on a member's Home (P-26 F-58): one row per status with its count and a
 * chevron, opening /orders?status=CODE. Cancelled shows only when above 0.
 */
export default function OrderStatusCounts({ byStatus, className = '' }) {
    const counts = byStatus || {};
    const rows = ORDER.filter((s) => s !== 'CANCELLED' || num(counts[s]) > 0);

    return (
        <Section title="My orders by status" className={className}>
            <ul className="divide-y divide-line border-t border-line">
                {rows.map((s) => (
                    <li key={s}>
                        <Link
                            to={`/orders?status=${s}`}
                            className="flex min-h-12 items-center justify-between gap-3 px-4 text-sm text-ink transition hover:bg-surface-subtle focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
                        >
                            <span>{LABELS[s] || s}</span>
                            <span className="flex items-center gap-2">
                                <span className="font-medium tabular-nums">{num(counts[s])}</span>
                                <Icon name="chevron-right" size="sm" className="text-ink-subtle" />
                            </span>
                        </Link>
                    </li>
                ))}
            </ul>
        </Section>
    );
}
