// Runs once at server start; Next.js waits for it before handling requests. The region comes
// from the shell (`assume`) and STAGE from the repo root .env (both loaded in next.config.mjs);
// the table names and queue URL then come from SSM (/vartalap/<STAGE>/config/).
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { loadConfigFromSsm, useShellRegion } = await import('@vartalap/core');
  useShellRegion();
  await loadConfigFromSsm();
}
