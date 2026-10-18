import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Monorepo root (where the workspace lockfile lives), so Next doesn't guess it.
const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const nextConfig = {
  // @vartalap/core ships untranspiled ESM source from the workspace.
  transpilePackages: ['@vartalap/core'],
  outputFileTracingRoot: repoRoot,
  turbopack: { root: repoRoot },
  // F3: defence in depth; no URL (chat ids included) is ever sent as Referer to other sites.
  async headers() {
    return [{ source: '/:path*', headers: [{ key: 'Referrer-Policy', value: 'same-origin' }] }];
  },
};

export default nextConfig;
