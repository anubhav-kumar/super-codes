import { z } from 'zod';
import {
  MEDIA_CAPTION_MAX,
  MEDIA_FILENAME_MAX,
  MEDIA_STATES,
  OUTBOUND_MEDIA_KINDS,
} from '../media/constants.js';

// F2: nested objects on a Messages item. All optional on MessageSchema, so text-only items from
// before F2 still validate (no migration).

// waMediaId and s3Key are server-only: stripped by toMessageMediaView before any response.
export const MediaSchema = z.object({
  waMediaId: z.string().min(1).nullable().optional(),
  s3Key: z.string().min(1).nullable().optional(),
  mimeType: z.string().max(255).nullable().optional(),
  size: z.number().int().nonnegative().nullable().optional(),
  sha256: z.string().max(128).nullable().optional(),
  filename: z.string().max(MEDIA_FILENAME_MAX).nullable().optional(),
  caption: z.string().max(4096).nullable().optional(),
  voice: z.boolean().optional(),
  animated: z.boolean().optional(),
  state: z.enum(MEDIA_STATES),
  errorCode: z.string().max(64).nullable().optional(),
});

export const LocationSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  name: z.string().max(1000).nullable().optional(),
  address: z.string().max(1000).nullable().optional(),
});

// Decision D6: shared contact cards keep only the display name and how many numbers it had.
export const ContactCardSchema = z.object({
  formattedName: z.string().max(200).nullable(),
  phoneCount: z.number().int().nonnegative(),
});

// Set on the *target* message. Only the client's reaction is tracked for now.
export const ReactionsSchema = z.object({
  client: z.string().max(32).optional(),
});

const ULID_REGEX = /^[0-9A-HJKMNP-TV-Z]{26}$/;

export const CreateUploadBodySchema = z.object({
  mimeType: z.string().trim().min(1).max(255),
  size: z.number().int().positive(),
  filename: z.string().trim().max(MEDIA_FILENAME_MAX).optional(),
});

// Media variant of POST /api/chats/[id]/messages. uploadId is the ULID from the uploads route;
// it becomes the message ID, so a repeated send of one upload is rejected as a duplicate.
export const SendMediaMessageBodySchema = z.object({
  type: z.enum(OUTBOUND_MEDIA_KINDS),
  uploadId: z.string().regex(ULID_REGEX, 'Invalid upload ID'),
  caption: z.string().trim().max(MEDIA_CAPTION_MAX).optional(),
  filename: z.string().trim().max(MEDIA_FILENAME_MAX).optional(),
});

// Payload the webhook puts on the media-fetch queue. Only the internal message ID: the Lambda
// reads waMediaId from the stored message, so no Meta ID or phone number sits in the queue.
export const MediaFetchQueueMessageSchema = z.object({
  messageId: z.string().min(1),
});
