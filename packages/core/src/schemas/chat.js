import { z } from 'zod';
import { PhoneSchema, TimestampSchema } from './common.js';

export const UNASSIGNED = 'UNASSIGNED';
export const MESSAGING_WINDOW_MS = 24 * 60 * 60 * 1000;
export const CHAT_PREVIEW_LENGTH = 80;

export const ChatSchema = z.object({
  chatId: PhoneSchema,
  headMessageId: z.string().min(1).nullable(),
  assignedTo: z.string().min(1), // userId or UNASSIGNED
  lastClientMessageAt: TimestampSchema,
  lastMessageAt: TimestampSchema,
  lastMessagePreview: z.string(),
  clientName: z.string().nullable(),
});

export const ChatSummarySchema = ChatSchema.extend({
  assignee: z.object({ userId: z.string(), name: z.string() }).nullable(),
  windowOpen: z.boolean(),
});
