import { useEffect, useState } from 'react';
import { formatDateTime } from '../utils/format.js';
import { formatRelativeTime } from '../utils/relativeTime.js';

// One interval for every mounted RelativeTime; it stops when the last one unmounts.
const listeners = new Set();
let timer = null;

function subscribe(listener) {
    listeners.add(listener);
    if (!timer) {
        timer = setInterval(() => {
            const now = new Date();
            listeners.forEach((l) => l(now));
        }, 60000);
    }
    return () => {
        listeners.delete(listener);
        if (listeners.size === 0 && timer) {
            clearInterval(timer);
            timer = null;
        }
    };
}

/** "5 min ago" in a <time> element, full date-time in the title; refreshed every minute. */
export default function RelativeTime({ value, className = '' }) {
    const [now, setNow] = useState(() => new Date());
    useEffect(() => subscribe(setNow), []);
    if (!value) return null;
    return (
        <time dateTime={value} title={formatDateTime(value)} className={className}>
            {formatRelativeTime(value, now)}
        </time>
    );
}
