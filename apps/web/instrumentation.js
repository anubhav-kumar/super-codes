// Runs once at server start; Next.js waits for it before handling requests. Loads the
// table names and queue URL from SSM (/vartalap/<STAGE>/config/), so .env.local needs only
// AWS_REGION and STAGE.
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return;
  const { loadConfigFromSsm } = await import('@vartalap/core');
  await loadConfigFromSsm();
}
