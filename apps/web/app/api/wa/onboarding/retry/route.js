import { RetryOnboardingBodySchema } from '@vartalap/core';
import { parseBody, requireAdmin, withHandler } from '../../../../../lib/api.js';
import { retryOnboarding } from '../../../../../lib/wa-onboarding.js';

export const runtime = 'nodejs';

// I3 demo. POST { pin? } → { connection }. Resumes a failed onboarding after its last
// completed step; pin only when the number already has a two-step verification PIN.
export const POST = withHandler(async (request) => {
  await requireAdmin(request);
  const { pin } = await parseBody(request, RetryOnboardingBodySchema);
  return Response.json({ connection: await retryOnboarding({ pin }) });
});
