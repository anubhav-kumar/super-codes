import { requireAdmin, withHandler } from '../../../../../lib/api.js';
import { newState, stateCookie } from '../../../../../lib/wa-onboarding.js';

export const runtime = 'nodejs';

// I3 demo. POST → { state }, also set as an HttpOnly cookie. /complete must echo it, so a
// completion can only come from a signup this admin's own settings page started.
export const POST = withHandler(async (request) => {
  await requireAdmin(request);
  const state = newState();
  return Response.json({ state }, { headers: { 'Set-Cookie': stateCookie(state, request) } });
});
