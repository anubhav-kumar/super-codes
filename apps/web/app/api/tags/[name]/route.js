import { AppError, TagSchema, removeCatalogTag } from '@vartalap/core';
import { noContent, requireAdmin, withHandler } from '../../../../lib/api.js';

export const runtime = 'nodejs';

function decode(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

// F4 phase 3: DELETE → 204. Admin only. Chats that carry the tag keep it.
export const DELETE = withHandler(async (request, context) => {
  const user = await requireAdmin(request);
  const { name: raw } = await context.params;
  const parsed = TagSchema.safeParse(decode(String(raw ?? '')));
  if (!parsed.success) {
    throw new AppError('VALIDATION', 'Invalid tag', {
      issues: [{ path: ['name'], message: 'Invalid tag' }],
    });
  }
  await removeCatalogTag({ name: parsed.data, by: user });
  return noContent();
});
