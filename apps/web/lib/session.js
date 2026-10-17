import { SignJWT, jwtVerify } from 'jose';
import { ROLES } from '@vartalap/core';

export const SESSION_COOKIE = 'vartalap_session';
export const SESSION_TTL_SECONDS = 8 * 60 * 60;

const ALG = 'HS256';
const JWT_SECRET_MIN_LENGTH = 32;

// Read per call (not cached) so a missing secret fails loudly instead of at import time.
function getSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < JWT_SECRET_MIN_LENGTH) {
    throw new Error(`JWT_SECRET must be set and at least ${JWT_SECRET_MIN_LENGTH} characters`);
  }
  return new TextEncoder().encode(secret);
}

export async function signSession(user) {
  return new SignJWT({ role: user.role })
    .setProtectedHeader({ alg: ALG })
    .setSubject(user.userId)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(getSecret());
}

// → { userId, role } | null. Bad, expired or foreign-signed tokens give null; a missing
// JWT_SECRET still throws, because that is a deployment error, not a bad token.
export async function verifySession(token) {
  const secret = getSecret();
  if (typeof token !== 'string' || !token) return null;

  try {
    const { payload } = await jwtVerify(token, secret, { algorithms: [ALG] });
    if (typeof payload.sub !== 'string' || !payload.sub || !ROLES.includes(payload.role)) {
      return null;
    }
    return { userId: payload.sub, role: payload.role };
  } catch {
    return null;
  }
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_TTL_SECONDS,
  };
}

function serializeCookie(value, maxAge) {
  const { secure, path } = sessionCookieOptions();
  const parts = [
    `${SESSION_COOKIE}=${value}`,
    `Path=${path}`,
    `Max-Age=${maxAge}`,
    'HttpOnly',
    'SameSite=Lax',
  ];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

// Set-Cookie header values, usable from any framework's response object.
export function buildSetCookie(token) {
  return serializeCookie(token, SESSION_TTL_SECONDS);
}

export function buildClearCookie() {
  return serializeCookie('', 0);
}
