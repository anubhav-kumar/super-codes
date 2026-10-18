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
  // F3: opaque id for URLs/API (see chats/public-id.js). Optional until the backfill has run.
  publicId: z.string().regex(/^c_[0-9A-HJKMNP-TV-Z]{26}$/).optional(),
  // F4: client attributes (all optional; absent until first set). tags is a String Set in
  // DynamoDB and an array everywhere outside core (clients/normalize-tag.js tagsToArray).
  description: z.string().max(1000).optional(),
  descriptionUpdatedAt: TimestampSchema.optional(),
  descriptionUpdatedBy: z.string().min(1).optional(), // userId; ChatSummary resolves the name
  profileVersion: z.number().int().min(0).optional(),
  tags: z.array(z.string()).max(10).optional(),
});

export const ChatSummarySchema = ChatSchema.extend({
  assignee: z.object({ userId: z.string(), name: z.string() }).nullable(),
  windowOpen: z.boolean(),
  // F4: the last description editor, resolved to a name.
  descriptionUpdatedBy: z.object({ userId: z.string(), name: z.string() }).nullable().optional(),
});

// F3: what the API returns for a chat (chats/view.js). No chatId; `phone` for admins only.
// Documents the guaranteed fields; other optional chat fields pass through (passthrough()).
export const ChatViewSchema = z
  .object({
    id: z.string().nullable(),
    displayName: z.string().min(1),
    clientName: z.string().nullable(),
    phone: PhoneSchema.nullable().optional(),
    headMessageId: z.string().min(1).nullable(),
    assignedTo: z.string().min(1),
    assignee: z.object({ userId: z.string(), name: z.string() }).nullable(),
    lastClientMessageAt: TimestampSchema,
    lastMessageAt: TimestampSchema,
    lastMessagePreview: z.string(),
    windowOpen: z.boolean(),
  })
  .passthrough();
