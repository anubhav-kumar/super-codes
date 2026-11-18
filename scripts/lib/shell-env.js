import { loadRootEnv, useShellRegion } from '@vartalap/core/env';

// Region and stage for the scripts, the same way the web app gets them: the region from the
// shell (`assume` sets AWS_REGION / AWS_DEFAULT_REGION, and the credentials), STAGE from the
// shell or else the repo root .env, else dev. Writes both back to process.env, where core's
// config and SSM loader read them.
const ROOT_ENV = new URL('../../.env', import.meta.url);

export function useShellEnv() {
  loadRootEnv(ROOT_ENV);
  const region = useShellRegion();
  const stage = process.env.STAGE || 'dev';
  process.env.STAGE = stage;
  return { region, stage };
}
