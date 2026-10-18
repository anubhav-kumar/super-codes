import { z } from 'zod';
import { PhoneSchema, TimestampSchema } from './common.js';
import { ContactCardSchema, LocationSchema, MediaSchema, ReactionsSchema } from './media.js';

export const MESSAGE_STATUSES = ['pending', 'sent', 'delivered', 'read', 'failed'];

// Status may only move forward; 'failed' is terminal and allowed only from pending/sent.
export const STATUS_RANK = Object.freeze({ pending: 0, sent: 1, delivered: 2, read: 3 });
export const FAILABLE_STATUSES = ['pending', 'sent'];

export const MESSAGE_TEXT_MAX = 4096;

// F2: 'text' plus every inbound/outbound kind (docs/features/f2-media-messages.md §4.2).
export const MESSAGE_TYPES = [
  'text',
  'image',
  'video',
  'audio',
  'document',
  'sticker',
  'location',
  'contacts',
  'interactive',
  'button',
  'unsupported',
];

export const MessageSchema = z.object({
  messageId: z.string().min(1),
  chatId: PhoneSchema,
  prevMessageId: z.string().min(1).nullable(),
  direction: z.enum(['in', 'out']),
  senderType: z.enum(['client', 'agent', 'admin']),
  senderId: z.string().min(1).nullable(),
  type: z.enum(MESSAGE_TYPES),
  // F2: still required on every type; for media it is the summary ("[Photo] caption").
  text: z.string().max(MESSAGE_TEXT_MAX),
  // F2 media fields (schemas/media.js); all optional, so pre-F2 items still validate.
  media: MediaSchema.optional(),
  location: LocationSchema.optional(),
  contacts: z.array(ContactCardSchema).max(20).optional(),
  reactions: ReactionsSchema.optional(),
  waMessageId: z.string().min(1).nullable(),
  status: z.enum(MESSAGE_STATUSES),
  statusRank: z.number().int().min(0).max(3).optional(),
  errorCode: z.string().nullable().optional(),
  createdAt: TimestampSchema,
});

// F3: what the API returns for a message (messages/view.js): never chatId (the client's
// phone), waMessageId (a wamid embeds it) or statusRank.
export const MessageViewSchema = MessageSchema.omit({
  chatId: true,
  waMessageId: true,
  statusRank: true,
});
