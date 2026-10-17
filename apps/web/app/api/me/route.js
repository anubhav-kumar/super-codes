import { requireUser, withHandler } from '../../../lib/api.js';

export const runtime = 'nodejs';

export const GET = withHandler(async (request) => {
  const user = await requireUser(request);
  return Response.json({ user });
});
