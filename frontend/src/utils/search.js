const normalize = (value) => String(value ?? '').toLowerCase().trim();
// Ignores spaces and phone punctuation, so "98450 12345" matches "9845012345".
const compact = (value) => normalize(value).replace(/[\s\-+().]/g, '');

const fieldValue = (item, field) => (typeof field === 'function' ? field(item) : item ? item[field] : '');

/** Case-insensitive match of `query` against any of `fields` (property names or functions). Empty query matches all. */
export function matchesSearch(item, query, fields) {
    const q = normalize(query);
    if (!q) return true;
    const qc = compact(query);
    return fields.some((field) => {
        const value = fieldValue(item, field);
        if (value === null || value === undefined || value === '') return false;
        return normalize(value).includes(q) || (qc !== '' && compact(value).includes(qc));
    });
}
