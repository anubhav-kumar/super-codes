import { z } from 'zod';

export const ROLES = ['admin', 'agent'];
export const PASSWORD_MIN_LENGTH = 8;
// bcrypt ignores everything past 72 bytes, so longer passwords are rejected.
export const PASSWORD_MAX_BYTES = 72;

// Public view: never includes passwordHash.
export const UserSchema = z.object({
  userId: z.string().min(1),
  email: z.email(),
  name: z.string().min(1),
  role: z.enum(ROLES),
  active: z.boolean(),
  // Sessions issued before this instant are rejected (see verifySession / requireUser).
  passwordChangedAt: z.iso.datetime().nullable(),
});
