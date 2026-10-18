import { requireAdmin, withHandler } from '../../../../lib/api.js';
import { onboardingStatus } from '../../../../lib/wa-onboarding.js';

export const runtime = 'nodejs';

// I3 demo. GET → { config, connection, active, canRestorePrevious }. Admin only.
// Never includes the business token or the registration PIN.
export const GET = withHandler(async (request) => {
  await requireAdmin(request);
  return Response.json(await onboardingStatus());
});
