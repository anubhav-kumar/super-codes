import { z } from 'zod';
import { PhoneSchema, TimestampSchema } from './common.js';

export const MESSAGE_STATUSES = ['pending', 'sent', 'delivered', 'read', 'failed'];

// Status may only move forward; 'failed' is terminal and allowed only from pending/sent.
export const STATUS_RANK = Object.freeze({ pending: 0, sent: 1, delivered: 2, read: 3 });
export const FAILABLE_STATUSES = ['pending', 'sent'];

export const MESSAGE_TEXT_MAX = 4096;

export const MessageSchema = z.object({
  messageId: z.string().min(1),
  chatId: PhoneSchema,
  prevMessageId: z.string().min(1).nullable(),
  direction: z.enum(['in', 'out']),
  senderType: z.enum(['client', 'agent', 'admin']),
  senderId: z.string().min(1).nullable(),
  type: z.enum(['text']),
  text: z.string().max(MESSAGE_TEXT_MAX),
  waMessageId: z.string().min(1).nullable(),
  status: z.enum(MESSAGE_STATUSES),
  statusRank: z.number().int().min(0).max(3).optional(),
  errorCode: z.string().nullable().optional(),
  createdAt: TimestampSchema,
});
