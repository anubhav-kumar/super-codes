import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

const DEFAULT_APP_NAME = 'CA CRM';

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Runtime caching for API GET responses. The functions below are serialized into the
// generated sw.js, so they must be self-contained (no outer variables).
const apiFetchTimePlugin = {
    // Stamp the time a response was fetched, so the UI can show "Last updated ...".
    cacheWillUpdate: async ({ response }) => {
        if (!response || response.status !== 200) return null;
        const headers = new Headers(response.headers);
        headers.set('x-sw-fetched-at', new Date().toISOString());
        const body = await response.clone().blob();
        return new Response(body, { status: response.status, statusText: response.statusText, headers });
    },
    // Mark responses served from the cache (network failed or timed out).
    cachedResponseWillBeUsed: async ({ cachedResponse }) => {
        if (!cachedResponse) return cachedResponse;
        const headers = new Headers(cachedResponse.headers);
        headers.set('x-sw-cache', 'hit');
        const body = await cachedResponse.blob();
        return new Response(body, { status: cachedResponse.status, statusText: cachedResponse.statusText, headers });
    },
};

export default defineConfig(({ mode }) => {
    // import.meta.env is not available here; loadEnv reads .env* files and VITE_* process env vars.
    const env = loadEnv(mode, process.cwd());
    const apiBaseUrl = (env.VITE_API_BASE_URL || '').replace(/\/+$/, '');
    const appName = env.VITE_APP_NAME || DEFAULT_APP_NAME;

    const apiRules = apiBaseUrl
        ? [
              // Health must always hit the network: a cached "API online" would be misleading.
              {
                  urlPattern: new RegExp(`^${escapeRegExp(apiBaseUrl)}/health(?:[/?#]|$)`),
                  handler: 'NetworkOnly',
              },
              {
                  urlPattern: new RegExp(`^${escapeRegExp(apiBaseUrl)}/`),
                  method: 'GET',
                  handler: 'NetworkFirst',
                  options: {
                      cacheName: 'api-get',
                      networkTimeoutSeconds: 5,
                      expiration: { maxEntries: 500, maxAgeSeconds: 7 * 24 * 60 * 60 },
                      plugins: [apiFetchTimePlugin],
                  },
              },
          ]
        : [];

    return {
        plugins: [
            react(),
            tailwindcss(),
            VitePWA({
                registerType: 'prompt',
                injectRegister: false, // registered from src/offline/serviceWorker.js
                manifest: {
                    name: appName,
                    short_name: appName,
                    description: appName,
                    start_url: '/',
                    scope: '/',
                    display: 'standalone',
                    orientation: 'portrait',
                    theme_color: '#0f172a',
                    background_color: '#0f172a',
                    icons: [
                        { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
                        { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
                        { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
                    ],
                },
                workbox: {
                    globPatterns: ['**/*.{html,js,css,woff2,svg,png,ico,webmanifest}'],
                    navigateFallback: '/index.html',
                    cleanupOutdatedCaches: true,
                    runtimeCaching: [
                        ...apiRules.slice(0, 1), // NetworkOnly /health first
                        {
                            urlPattern: ({ request }) => request.destination === 'image',
                            handler: 'CacheFirst',
                            options: {
                                cacheName: 'images',
                                expiration: { maxEntries: 200, maxAgeSeconds: 30 * 24 * 60 * 60 },
                            },
                        },
                        ...apiRules.slice(1),
                    ],
                },
            }),
        ],
    };
});
