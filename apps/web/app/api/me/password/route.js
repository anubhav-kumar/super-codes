import { ChangePasswordBodySchema, changePassword, getUserById } from '@vartalap/core';
import { noContent, parseBody, requireUser, withHandler } from '../../../../lib/api.js';
import { buildSetCookie, signSession } from '../../../../lib/session.js';

export const runtime = 'nodejs';

export const PUT = withHandler(async (request) => {
  const user = await requireUser(request);
  const { currentPassword, newPassword } = await parseBody(request, ChangePasswordBodySchema);

  await changePassword(user.userId, currentPassword, newPassword);

  // Older sessions are now rejected (passwordChangedAt); keep this one signed in.
  const fresh = (await getUserById(user.userId)) ?? user;
  const token = await signSession(fresh);
  return noContent({ 'Set-Cookie': buildSetCookie(token) });
});
