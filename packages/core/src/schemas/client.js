import { z } from 'zod';
import { TAG_MAX_LENGTH, TAG_REGEX, normalizeTag } from '../clients/normalize-tag.js';

// F4: client attributes (description, notes, tags). Never sent to WhatsApp.
export { TAG_MAX_LENGTH, TAG_REGEX };
export const DESCRIPTION_MAX = 1000;
export const NOTE_BODY_MAX = 2000;
export const MAX_TAGS_PER_CHAT = 10;
export const MAX_CATALOG_TAGS = 200;
export const NOTE_EDIT_WINDOW_MS = 15 * 60 * 1000;
export const NOTES_PAGE_MAX = 50;
export const NOTES_PAGE_DEFAULT = 20;

const TAG_MESSAGE =
  'Tags are 1–32 letters, digits, "-" or "_", starting with a letter or digit';

export const TagSchema = z
  .string()
  .transform(normalizeTag)
  .pipe(z.string().regex(TAG_REGEX, TAG_MESSAGE));

export const UpdateDescriptionBodySchema = z.object({
  description: z.string().trim().max(DESCRIPTION_MAX),
  version: z.number().int().min(0),
});

export const AddTagBodySchema = z.object({ tag: TagSchema });

export const NoteBodySchema = z.object({
  body: z.string().trim().min(1).max(NOTE_BODY_MAX),
});

export const ListNotesQuerySchema = z.object({
  before: z.string().min(1).max(64).optional(),
  limit: z.coerce.number().int().min(1).max(NOTES_PAGE_MAX).default(NOTES_PAGE_DEFAULT),
});

// Phase 3: admin tag catalog.
export const CatalogTagBodySchema = z.object({ name: TagSchema });
export const TagSettingsBodySchema = z.object({ catalogOnly: z.boolean() });

export const NoteSchema = z.object({
  noteId: z.string(),
  body: z.string().nullable(),
  author: z.object({ userId: z.string(), name: z.string() }),
  authorRole: z.enum(['agent', 'admin']),
  createdAt: z.string(),
  editedAt: z.string().nullable(),
  deleted: z.boolean(),
  deletedBy: z.object({ userId: z.string(), name: z.string() }).optional(),
  deletedAt: z.string().optional(),
});
