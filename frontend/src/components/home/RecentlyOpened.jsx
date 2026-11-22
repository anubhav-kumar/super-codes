import { useEffect, useState } from 'react';
import { listRecent, RECENT_TYPES, recentPath, subscribeRecent } from '../../utils/recent.js';
import Icon from '../Icon.jsx';
import ListRow from '../ListRow.jsx';
import Section from '../Section.jsx';

const MAX_SHOWN = 6;

function TypeIcon({ type }) {
    const t = RECENT_TYPES[type];
    return (
        <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-muted text-ink-muted">
            <Icon name={t ? t.icon : 'recent'} size="sm" title={t ? t.label : undefined} />
        </span>
    );
}

/**
 * "Recently opened" on Home (F-21): the last records opened on this device (people, companies,
 * orders, invoices, workers), newest first, up to 6. Hidden when there are none. A record that no
 * longer exists is dropped from the list when it is opened (useRecordVisit on its detail screen).
 */
export default function RecentlyOpened({ className = '' }) {
    const [entries, setEntries] = useState(() => listRecent());

    useEffect(() => subscribeRecent(() => setEntries(listRecent())), []);

    const shown = entries.slice(0, MAX_SHOWN);
    if (shown.length === 0) return null;

    return (
        <Section title="Recently opened" className={className}>
            <ul className="divide-y divide-line border-t border-line">
                {shown.map((e) => (
                    <li key={`${e.type}:${e.id}`}>
                        <ListRow to={recentPath(e)} leading={<TypeIcon type={e.type} />} title={e.title} meta={e.subtitle ? e.subtitle.split(' · ') : undefined} />
                    </li>
                ))}
            </ul>
        </Section>
    );
}
