'use strict';

/**
 * scrypt password hashing. Stored format: scrypt$<N>$<r>$<p>$<saltB64>$<hashB64>
 * Used by handlers/login.js and backend/scripts/create-user.js.
 */

const crypto = require('crypto');

const N = 16384;
const R = 8;
const P = 1;
const KEYLEN = 64;
const SALT_BYTES = 16;

function scrypt(password, salt, { n, r, p, keylen }) {
    return new Promise((resolve, reject) => {
        crypto.scrypt(password, salt, keylen, { N: n, r, p, maxmem: 64 * 1024 * 1024 }, (err, key) =>
            err ? reject(err) : resolve(key)
        );
    });
}

async function hashPassword(password) {
    const salt = crypto.randomBytes(SALT_BYTES);
    const key = await scrypt(password, salt, { n: N, r: R, p: P, keylen: KEYLEN });
    return `scrypt$${N}$${R}$${P}$${salt.toString('base64')}$${key.toString('base64')}`;
}

/** Constant-time check of a password against a stored hash. Malformed hashes return false. */
async function verifyPassword(password, stored) {
    const parts = typeof stored === 'string' ? stored.split('$') : [];
    if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
    const [n, r, p] = parts.slice(1, 4).map(Number);
    const salt = Buffer.from(parts[4], 'base64');
    const expected = Buffer.from(parts[5], 'base64');
    if (![n, r, p].every(Number.isInteger) || expected.length === 0) return false;
    const actual = await scrypt(password, salt, { n, r, p, keylen: expected.length });
    return crypto.timingSafeEqual(actual, expected);
}

let dummyHashPromise;

/**
 * Hash of a random throwaway password, made once per Lambda container. Login verifies against it
 * when the email is unknown, so unknown emails and wrong passwords take similar time.
 */
function dummyHash() {
    if (!dummyHashPromise) dummyHashPromise = hashPassword(crypto.randomBytes(16).toString('hex'));
    return dummyHashPromise;
}

module.exports = { hashPassword, verifyPassword, dummyHash };
