import { getFirmSummary } from '../api/summary.js';
import useResource from './useResource.js';

/**
 * Firm summary for Home (F-20), readable offline from the last load.
 * useResource shape: { status, data: Summary, fromCache, fetchedAt, error, reload }.
 */
export default function useFirmSummary() {
    return useResource('firm-summary', getFirmSummary);
}
