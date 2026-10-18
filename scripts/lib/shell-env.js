// Region and stage for the scripts, taken from the shell instead of apps/web/.env.local:
// `assume` sets AWS_REGION / AWS_DEFAULT_REGION (and the credentials); STAGE defaults to dev.
// Writes both back to process.env, where core's config and SSM loader read them.
export function useShellEnv() {
  const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION;
  if (!region) throw new Error('No AWS region in the shell; run `assume` first');
  const stage = process.env.STAGE || 'dev';
  process.env.AWS_REGION = region;
  process.env.STAGE = stage;
  return { region, stage };
}
