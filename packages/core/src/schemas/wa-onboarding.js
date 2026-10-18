import { z } from 'zod';

// I3 demo: Meta IDs are numeric strings. They come from the browser (Embedded Signup's
// message event), so the server checks them against what the business token can see.
const MetaIdSchema = z.string().regex(/^\d{1,30}$/, 'Must be a Meta ID');

// Two-step verification PIN for POST /<PHONE_NUMBER_ID>/register.
export const WA_PIN_REGEX = /^\d{6}$/;

export const CompleteOnboardingBodySchema = z.object({
  code: z.string().min(1).max(2048),
  state: z.string().min(1).max(128),
  // Optional: the session info event can arrive late or not at all; the server then finds the
  // WABA and number from the token.
  wabaId: MetaIdSchema.optional(),
  phoneNumberId: MetaIdSchema.optional(),
});

export const RetryOnboardingBodySchema = z.object({
  // Only when the number already has a two-step verification PIN.
  pin: z.string().regex(WA_PIN_REGEX, 'PIN must be 6 digits').optional(),
});
