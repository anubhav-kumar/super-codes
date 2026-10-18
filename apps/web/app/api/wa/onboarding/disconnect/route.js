import { requireAdmin, withHandler } from '../../../../../lib/api.js';
import { disconnectNumber } from '../../../../../lib/wa-onboarding.js';

export const runtime = 'nodejs';

// I3 demo. POST → { restored, warnings }. Unsubscribes the app from the WABA and restores the
// manually configured number (if there was one).
export const POST = withHandler(async (request) => {
  await requireAdmin(request);
  return Response.json(await disconnectNumber());
});
