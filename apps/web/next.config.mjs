import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Monorepo root (where the workspace lockfile lives), so Next doesn't guess it.
const repoRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const nextConfig = {
  // @vartalap/core ships untranspiled ESM source from the workspace.
  transpilePackages: ['@vartalap/core'],
  outputFileTracingRoot: repoRoot,
  turbopack: { root: repoRoot },
};

export default nextConfig;
