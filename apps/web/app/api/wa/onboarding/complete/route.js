import { CompleteOnboardingBodySchema } from '@vartalap/core';
import { parseBody, requireAdmin, withHandler } from '../../../../../lib/api.js';
import { STATE_COOKIE, completeOnboarding, stateCookie } from '../../../../../lib/wa-onboarding.js';

export const runtime = 'nodejs';

// I3 demo. POST { code, state, wabaId?, phoneNumberId? } → { connection }.
// Exchanges the code, checks the assets, subscribes the app, registers the number and points
// the Lambdas at it. A failure leaves a resumable record (see /retry).
export const POST = withHandler(async (request) => {
  const user = await requireAdmin(request);
  const body = await parseBody(request, CompleteOnboardingBodySchema);
  const connection = await completeOnboarding({
    ...body,
    cookieState: request.cookies.get(STATE_COOKIE)?.value,
    user,
  });
  // The state is single use.
  return Response.json({ connection }, { headers: { 'Set-Cookie': stateCookie('', request) } });
});
