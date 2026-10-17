import { AppError, LoginBodySchema, verifyCredentials } from '@vartalap/core';
import { parseBody, withHandler } from '../../../../lib/api.js';
import { buildSetCookie, signSession } from '../../../../lib/session.js';

export const runtime = 'nodejs';

export const POST = withHandler(async (request) => {
  const { email, password } = await parseBody(request, LoginBodySchema);

  // One error for unknown email, wrong password and inactive user.
  const user = await verifyCredentials(email, password);
  if (!user) throw new AppError('UNAUTHENTICATED', 'Invalid email or password');

  const token = await signSession(user);
  return Response.json({ user }, { headers: { 'Set-Cookie': buildSetCookie(token) } });
});
