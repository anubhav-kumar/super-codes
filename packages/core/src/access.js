import { AppError } from './errors.js';

// v1: admins see and send in every chat; agents only in chats assigned to them.
export function canView(user, chat) {
  if (!user || !chat) return false;
  if (user.role === 'admin') return true;
  return user.role === 'agent' && chat.assignedTo === user.userId;
}

export function canSend(user, chat) {
  return canView(user, chat);
}

export function assertCanView(user, chat) {
  if (!canView(user, chat)) throw new AppError('FORBIDDEN', 'You cannot view this chat');
}

export function assertCanSend(user, chat) {
  if (!canSend(user, chat)) throw new AppError('FORBIDDEN', 'You cannot send in this chat');
}
