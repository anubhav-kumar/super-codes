'use strict';

/**
 * Temporary passwords for admin-created users (F-49) and admin resets (F-51).
 * 14 characters drawn with crypto.randomInt (never Math.random) from an alphabet without the
 * look-alikes 0 O 1 l I, so it can be read out or typed by hand. About 81 bits of entropy.
 */

const crypto = require('crypto');

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
const LENGTH = 14;
const VALID_MS = 2 * 60 * 60 * 1000;

function generateTemporaryPassword() {
    let out = '';
    for (let i = 0; i < LENGTH; i += 1) out += ALPHABET[crypto.randomInt(ALPHABET.length)];
    return out;
}

/** Expiry of a temporary password issued at `now` (Date): now + 2 hours, as an ISO string. */
function temporaryPasswordExpiry(now = new Date()) {
    return new Date(now.getTime() + VALID_MS).toISOString();
}

module.exports = { generateTemporaryPassword, temporaryPasswordExpiry };
