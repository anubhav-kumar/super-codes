import { useMemo, useState } from 'react';
import { matchesSearch } from '../utils/search.js';

/**
 * Device-side search over a loaded list.
 *   const { query, setQuery, filtered } = useListFilter(items, ['name', 'pan', 'phone']);
 * Fields are property names or functions (item) => string.
 */
export default function useListFilter(items, fields) {
    const [query, setQuery] = useState('');
    const key = fields.map((f) => (typeof f === 'function' ? f.toString() : f)).join('|');
    const filtered = useMemo(
        () => (Array.isArray(items) ? items.filter((item) => matchesSearch(item, query, fields)) : []),
        [items, query, key]
    );
    return { query, setQuery, filtered };
}
