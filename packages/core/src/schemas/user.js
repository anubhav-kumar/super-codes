import { z } from 'zod';

export const ROLES = ['admin', 'agent'];
export const PASSWORD_MIN_LENGTH = 8;

// Public view: never includes passwordHash.
export const UserSchema = z.object({
  userId: z.string().min(1),
  email: z.email(),
  name: z.string().min(1),
  role: z.enum(ROLES),
  active: z.boolean(),
});
