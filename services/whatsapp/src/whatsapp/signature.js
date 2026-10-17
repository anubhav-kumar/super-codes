import { createHmac, timingSafeEqual } from 'node:crypto';

const PREFIX = 'sha256=';
const HEX_SHA256 = /^[0-9a-f]{64}$/i;

// rawBody: Buffer of the exact request bytes. header: value of X-Hub-Signature-256.
// Never throws on a missing or malformed header; it just returns false.
export function verifySignature(rawBody, header, appSecret) {
  if (typeof header !== 'string' || !header.startsWith(PREFIX)) return false;
  const hex = header.slice(PREFIX.length);
  if (!HEX_SHA256.test(hex)) return false;

  const expected = createHmac('sha256', appSecret).update(rawBody).digest();
  const given = Buffer.from(hex, 'hex');
  return given.length === expected.length && timingSafeEqual(given, expected);
}
