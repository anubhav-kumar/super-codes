import { z } from 'zod';

export const E164_REGEX = /^\+[1-9]\d{6,14}$/;

export const PhoneSchema = z.string().regex(E164_REGEX, 'Must be an E.164 phone number');
export const TimestampSchema = z.iso.datetime();

// WhatsApp sends wa_id without '+'; URLs may carry either form.
export function normalizePhone(raw) {
  const digits = String(raw ?? '').replace(/[^\d]/g, '');
  const phone = `+${digits}`;
  return E164_REGEX.test(phone) ? phone : null;
}
