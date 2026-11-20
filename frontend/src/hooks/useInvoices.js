import { useCallback } from 'react';
import { getInvoice, listBilledToInvoices, listInvoices, listOrderInvoices } from '../api/invoices.js';
import useResource from './useResource.js';

/** All invoices, newest first. useResource shape: { status, data: Invoice[], fromCache, fetchedAt, error, reload }. */
export function useInvoices() {
    return useResource('invoices', listInvoices);
}

/** One invoice (detail, including `payments`). Pass null to skip loading. */
export function useInvoice(id) {
    const fetcher = useCallback(({ signal }) => getInvoice(id, { signal }), [id]);
    return useResource(id ? `invoice:${id}` : null, fetcher);
}

/** Invoices of one order, newest first. Pass null to skip loading. */
export function useOrderInvoices(orderId) {
    const fetcher = useCallback(({ signal }) => listOrderInvoices(orderId, { signal }), [orderId]);
    return useResource(orderId ? `order-invoices:${orderId}` : null, fetcher);
}

/**
 * Invoices billed to one person or company (F-08), newest first, with the server's totals.
 * data = { items: Invoice[], summary: { totalOutstanding, totalReceived } | null }. Pass null to skip loading.
 */
export function useBillingEntityInvoices(billedToId) {
    const fetcher = useCallback(({ signal }) => listBilledToInvoices(billedToId, { signal }), [billedToId]);
    return useResource(billedToId ? `billed-invoices:${billedToId}` : null, fetcher);
}
