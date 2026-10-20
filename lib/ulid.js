// Monotonic ULID generator. Zero dependencies.

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const ULID_RE = /^[0-9A-HJKMNP-TV-Z]{26}$/;
const TIME_LEN = 10;
const RANDOM_LEN = 16;
const MAX_TIME = 2 ** 48 - 1;

let lastId = null;

function encodeTime(ms) {
  let out = '';
  let t = ms;
  for (let i = 0; i < TIME_LEN; i++) {
    out = ALPHABET[t % 32] + out;
    t = Math.floor(t / 32);
  }
  return out;
}

function randomPart() {
  const bytes = new Uint8Array(RANDOM_LEN);
  globalThis.crypto.getRandomValues(bytes);
  let out = '';
  for (const b of bytes) out += ALPHABET[b & 31];
  return out;
}

function incrementBase32(str) {
  const chars = str.split('');
  for (let i = chars.length - 1; i >= 0; i--) {
    const v = ALPHABET.indexOf(chars[i]);
    if (v < 31) {
      chars[i] = ALPHABET[v + 1];
      return chars.join('');
    }
    chars[i] = ALPHABET[0];
  }
  throw new Error('ulid: random part overflow');
}

export function ulidTime(id) {
  if (typeof id !== 'string' || !ULID_RE.test(id)) throw new Error('ulid: invalid ULID');
  let t = 0;
  for (let i = 0; i < TIME_LEN; i++) t = t * 32 + ALPHABET.indexOf(id[i]);
  return t;
}

export function ulid({ after } = {}) {
  if (after !== undefined && after !== null && (typeof after !== 'string' || !ULID_RE.test(after))) {
    throw new Error('ulid: invalid `after`');
  }
  let floor = lastId;
  if (after && (floor === null || after > floor)) floor = after;

  const now = Date.now();
  if (now > MAX_TIME) throw new Error('ulid: time out of range');
  let id;
  if (floor === null || now > ulidTime(floor)) {
    id = encodeTime(now) + randomPart();
  } else {
    id = floor.slice(0, TIME_LEN) + incrementBase32(floor.slice(TIME_LEN));
  }
  lastId = id;
  return id;
}
