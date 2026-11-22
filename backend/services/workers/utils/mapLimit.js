'use strict';

/**
 * Runs fn(item, index) over items with at most `limit` promises in flight.
 * Returns the results in input order. Rejects on the first failure.
 */
async function mapLimit(items, limit, fn) {
    const results = new Array(items.length);
    let next = 0;
    async function worker() {
        while (next < items.length) {
            const i = next;
            next += 1;
            results[i] = await fn(items[i], i);
        }
    }
    const workers = [];
    for (let w = 0; w < Math.min(limit, items.length); w += 1) workers.push(worker());
    await Promise.all(workers);
    return results;
}

module.exports = { mapLimit };
