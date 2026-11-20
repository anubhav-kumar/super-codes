import { request } from './client.js';

/**
 * GET /health?clientTs=<now>. Always goes to the network: `no-store` here, and the
 * service worker routes /health as NetworkOnly. It does not change the app's
 * online/offline state, so an API outage shows as "API unreachable", not "Offline".
 */
export function getHealth({ signal } = {}) {
    const clientTs = encodeURIComponent(new Date().toISOString());
    return request(`/health?clientTs=${clientTs}`, { cache: 'no-store', signal, trackConnectivity: false });
}
