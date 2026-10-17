import { z } from 'zod';
import { MESSAGE_TEXT_MAX } from './message.js';
import { PASSWORD_MIN_LENGTH, ROLES } from './user.js';

const EmailSchema = z.string().trim().toLowerCase().pipe(z.email());

const PasswordSchema = z.string().min(PASSWORD_MIN_LENGTH).max(128);

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
});

export const ListMessagesQuerySchema = z.object({
  before: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
});

export const SendMessageBodySchema = z.object({
  text: z.string().trim().min(1).max(MESSAGE_TEXT_MAX),
});

export const AssignBodySchema = z.object({
  userId: z.string().min(1),
});

// Payload the web API puts on the outbound SQS FIFO queue (consumed by the sender Lambda).
export const OutboundQueueMessageSchema = z.object({
  messageId: z.string().min(1),
  chatId: z.string().min(1),
});
