import { z } from 'zod';
import { MESSAGE_TEXT_MAX } from './message.js';
import { TagSchema } from './client.js'; // F4
import { SendMediaMessageBodySchema } from './media.js'; // F2
import { PASSWORD_MAX_BYTES, PASSWORD_MIN_LENGTH, ROLES } from './user.js';

const EmailSchema = z.string().trim().toLowerCase().pipe(z.email());

const PasswordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH)
  .refine((p) => Buffer.byteLength(p, 'utf8') <= PASSWORD_MAX_BYTES, {
    message: `Password must be at most ${PASSWORD_MAX_BYTES} bytes`,
  });

export const LoginBodySchema = z.object({
  email: EmailSchema,
  password: z.string().min(1),
});

export const ChangePasswordBodySchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: PasswordSchema,
});

export const CreateUserBodySchema = z.object({
  email: EmailSchema,
  name: z.string().trim().min(1).max(100),
  role: z.enum(ROLES),
  password: PasswordSchema,
});

export const ListChatsQuerySchema = z.object({
  filter: z.enum(['mine', 'unassigned', 'all']).default('mine'),
  // F4: optional tag filter, normalized like stored tags.
  tag: TagSchema.optional(),
});

export const ListMessagesQuerySchema = z.object({
  before: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

export const SendTextMessageBodySchema = z.object({
  text: z.string().trim().min(1).max(MESSAGE_TEXT_MAX),
});

// F2: `{ text }` or `{ type, uploadId, caption?, filename? }` (schemas/media.js).
export const SendMessageBodySchema = z.union([SendTextMessageBodySchema, SendMediaMessageBodySchema]);

export const AssignBodySchema = z.object({
  userId: z.string().min(1),
});

// Payload the web API puts on the outbound SQS FIFO queue (consumed by the sender Lambda).
// F3 Phase 3: phone-free. The sender reads the recipient from the stored message; publicId is
// for logs only (and is the FIFO group). chatId is accepted from legacy in-flight jobs only.
export const OutboundQueueMessageSchema = z.object({
  messageId: z.string().min(1),
  publicId: z.string().min(1).optional(),
  chatId: z.string().min(1).optional(),
});
