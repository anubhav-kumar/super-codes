import { randomBytes } from 'node:crypto';

// F3: opaque, non-guessable chat identifier used in every URL and API response instead of
// the client's phone number (which stays the internal Chats PK). 16 random bytes as
// Crockford base32 (26 chars) with a 'c_' prefix: 28 characters, no timestamp inside.
const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const PUBLIC_ID_BYTES = 16;
export const PUBLIC_ID_PREFIX = 'c_';
export const PUBLIC_ID_REGEX = /^c_[0-9A-HJKMNP-TV-Z]{26}$/;

function toCrockford(bytes) {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of bytes) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += CROCKFORD[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
    value &= (1 << bits) - 1;
  }
  if (bits > 0) out += CROCKFORD[(value << (5 - bits)) & 31];
  return out;
}

export function newPublicId() {
  return `${PUBLIC_ID_PREFIX}${toCrockford(randomBytes(PUBLIC_ID_BYTES))}`;
}

export function isPublicId(value) {
  return typeof value === 'string' && PUBLIC_ID_REGEX.test(value);
}
