import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

const keyOf = (value) => String(value || '').replace(/^-/, '');

/**
 * List sort kept in the URL (?sort=, minus prefix = descending).
 *   const list = useListSort([
 *       { value: 'due', label: 'Due date', compare: compareByDue },
 *       { value: '-orderDate', label: 'Order date', compare: (a, b) => cmp(a.orderDate, b.orderDate) },
 *   ], 'due');
 *   rows.slice().sort(list.compare)
 * Each option's `value` is its default direction; `compare` sorts ascending and is reversed for "-key".
 * Returns { sort, key, desc, setSort, compare, options, active }. `setSort('-amount')` writes the URL
 * with replace (the default value removes the param).
 */
export default function useListSort(options, defaultValue) {
    const [params, setParams] = useSearchParams();
    const requested = params.get('sort') || '';
    const fallback = defaultValue || (options[0] && options[0].value) || '';

    const active = options.find((o) => keyOf(o.value) === keyOf(requested)) ? requested : fallback;
    const key = keyOf(active);
    const desc = active.startsWith('-');
    const option = options.find((o) => keyOf(o.value) === key) || null;

    const setSort = useCallback(
        (value) => {
            setParams(
                (prev) => {
                    const next = new URLSearchParams(prev);
                    if (!value || value === fallback) next.delete('sort');
                    else next.set('sort', value);
                    return next;
                },
                { replace: true }
            );
        },
        [setParams, fallback]
    );

    const compare = useMemo(() => {
        if (!option || !option.compare) return () => 0;
        return desc ? (a, b) => option.compare(b, a) : option.compare;
    }, [option, desc]);

    return { sort: active, key, desc, setSort, compare, options, active: option };
}

/** Ascending compare helpers for useListSort options. Empty values sort last. */
export function compareText(pick) {
    return (a, b) => String(pick(a) || '').localeCompare(String(pick(b) || ''), undefined, { sensitivity: 'base' });
}

export function compareNumber(pick) {
    return (a, b) => {
        const x = Number(pick(a));
        const y = Number(pick(b));
        const xv = Number.isFinite(x);
        const yv = Number.isFinite(y);
        if (!xv || !yv) return xv === yv ? 0 : xv ? -1 : 1;
        return x - y;
    };
}
