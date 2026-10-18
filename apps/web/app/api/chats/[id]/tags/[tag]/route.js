import { AppError, TagSchema, assertCanView, removeTag } from '@vartalap/core';
import { requireUser, resolveChat, withHandler } from '../../../../../../lib/api.js';

export const runtime = 'nodejs';

function decode(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

// F4: DELETE → 200 { tags } (the remaining tags). Removing an absent tag is a no-op.
export const DELETE = withHandler(async (request, context) => {
  const user = await requireUser(request);
  const { tag: raw } = await context.params;
  const parsed = TagSchema.safeParse(decode(String(raw ?? '')));
  if (!parsed.success) {
    throw new AppError('VALIDATION', 'Invalid tag', {
      issues: [{ path: ['tag'], message: 'Invalid tag' }],
    });
  }
  const chat = await resolveChat(context, user, assertCanView);

  const tags = await removeTag({ chatId: chat.chatId, user, tag: parsed.data });
  return Response.json({ tags });
});
