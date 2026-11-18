import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRootEnv, useShellRegion } from '@vartalap/core/env';

// Monorepo root (where the workspace lockfile lives), so Next doesn't guess it.
const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

// STAGE from the repo root .env (Next itself only reads apps/web/.env*); region from the
// shell (`assume`). Runs before proxy.js and instrumentation.js. Not required here, so
// `next build` works without AWS; instrumentation.js fails fast at server start instead.
loadRootEnv(path.join(repoRoot, '.env'));
useShellRegion({ required: false });

const nextConfig = {
  // @vartalap/core ships untranspiled ESM source from the workspace.
  transpilePackages: ['@vartalap/core'],
  outputFileTracingRoot: repoRoot,
  turbopack: { root: repoRoot },
  // F3: defence in depth; no URL (chat ids included) is ever sent as Referer to other sites.
  async headers() {
    return [
      { source: '/:path*', headers: [{ key: 'Referrer-Policy', value: 'same-origin' }] },
      // I3 demo: Meta's signup popup needs to know which site opened it. Send only the origin
      // (never the path) from this page, which has no chat ids. The later rule wins.
      {
        source: '/admin/whatsapp',
        headers: [{ key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' }],
      },
    ];
  },
};

export default nextConfig;
