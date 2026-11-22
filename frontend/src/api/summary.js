/** Firm summary for Home (backend contract R1, F-20, service dashboard). */
import { API_BASE_URL } from '../config.js';
import { todayLocal } from '../utils/dates.js';
import { ApiError, request } from './client.js';

const SUMMARY_PATH = '/dashboard/summary';
const API_CACHE = 'api-get';

/**
 * The service worker caches GET responses by full URL, and the summary URL carries the device date
 * (?today=), so a load on a new day offline misses yesterday's entry. Fall back to the newest cached
 * summary of any day; the page shows it as stale with its "Last updated" time.
 */
async function latestCachedSummary() {
    if (typeof caches === 'undefined' || !API_BASE_URL) return null;
    try {
        const cache = await caches.open(API_CACHE);
        const matches = await cache.matchAll(`${API_BASE_URL}${SUMMARY_PATH}`, { ignoreSearch: true });
        let best = null;
        let bestAt = '';
        for (const res of matches) {
            const at = res.headers.get('x-sw-fetched-at') || '';
            if (!best || at > bestAt) {
                best = res;
                bestAt = at;
            }
        }
        if (!best) return null;
        const data = await best.json();
        return { data, status: 200, fromCache: true, fetchedAt: bestAt || null };
    } catch {
        return null;
    }
}

/**
 * GET /dashboard/summary?today=YYYY-MM-DD (device local date) ->
 *   data = { today, invoices: { outstandingTotal, unpaidCount, overdueTotal, overdueCount },
 *            orders: { overdueCount, dueSoonCount }, overdueInvoices: [...] (<= 10),
 *            overdueOrders: [...] (<= 10), generatedAt }
 * Offline with no cached copy for today: the newest cached summary of an earlier day, if any.
 */
export async function getFirmSummary({ signal, today = todayLocal() } = {}) {
    try {
        return await request(`${SUMMARY_PATH}?today=${encodeURIComponent(today)}`, { signal });
    } catch (error) {
        if (error instanceof ApiError && error.offline) {
            const cached = await latestCachedSummary();
            if (cached) return cached;
        }
        throw error;
    }
}
