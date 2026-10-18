import { getChat } from '../chats/repo.js';
import { canView } from '../access.js';
import { AppError } from '../errors.js';

// F4: shared pieces for writes that must still hold when the chat is reassigned between the
// route's access check and the write. The write is conditioned on the chat existing and, for
// agents, on still being assigned to the caller.

// → { expression, names, values } to AND into a Chats ConditionExpression.
export function chatAccessCondition(user) {
  const expression =
    user.role === 'admin'
      ? 'attribute_exists(chatId)'
      : 'attribute_exists(chatId) AND assignedTo = :caller';
  const values = user.role === 'admin' ? {} : { ':caller': user.userId };
  return { expression, values };
}

// After a failed condition: re-read the chat and throw the access error that applies, or
// return the (fresh) chat when access still holds so the caller can decide (e.g. CONFLICT).
// Mirrors loadChatFor: a missing chat is NOT_FOUND for admins and FORBIDDEN for agents.
export async function recheckAccess(user, chatId) {
  const chat = await getChat(chatId, { consistent: true });
  if (!chat) {
    if (user.role === 'admin') throw new AppError('NOT_FOUND', 'Chat not found');
    throw new AppError('FORBIDDEN', 'You cannot access this chat');
  }
  if (!canView(user, chat)) throw new AppError('FORBIDDEN', 'You cannot view this chat');
  return chat;
}
