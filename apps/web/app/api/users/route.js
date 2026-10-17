import { CreateUserBodySchema, createUser, listUsers } from '@vartalap/core';
import { parseBody, requireAdmin, withHandler } from '../../../lib/api.js';

export const runtime = 'nodejs';

export const GET = withHandler(async (request) => {
  await requireAdmin(request);
  const users = await listUsers();
  return Response.json({ users });
});

export const POST = withHandler(async (request) => {
  await requireAdmin(request);
  const body = await parseBody(request, CreateUserBodySchema);
  const user = await createUser(body);
  return Response.json({ user }, { status: 201 });
});
