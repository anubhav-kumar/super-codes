import { GetParameterCommand, SSMClient } from '@aws-sdk/client-ssm';
import { SignJWT, jwtVerify } from 'jose';
import { ROLES } from '@vartalap/core';

export const SESSION_COOKIE = 'vartalap_session';
export const SESSION_TTL_SECONDS = 8 * 60 * 60;

const ALG = 'HS256';
const JWT_SECRET_MIN_LENGTH = 32;
const PLACEHOLDER = 'CHANGE_ME';
// A rotated key takes effect within this window (existing sessions are then signed out).
const SECRET_CACHE_MS = 5 * 60 * 1000;

let ssm;
let cached; // { key, expiresAt }

// The signing key lives in SSM (/vartalap/<stage>/JWT_SECRET, created by the stack), never
// in env files. JWT_SECRET_PARAM overrides the parameter name.
function secretParamName() {
  if (process.env.JWT_SECRET_PARAM) return process.env.JWT_SECRET_PARAM;
  if (!process.env.STAGE) throw new Error('STAGE must be set to locate the JWT_SECRET parameter');
  return `/vartalap/${process.env.STAGE}/JWT_SECRET`;
}

// Throws on a missing or placeholder key: that is a deployment error, not a bad token.
async function getSecret() {
  const now = Date.now();
  if (cached && cached.expiresAt > now) return cached.key;

  const name = secretParamName();
  ssm ??= new SSMClient({});
  const { Parameter } = await ssm.send(
    new GetParameterCommand({ Name: name, WithDecryption: true }),
  );
  const value = Parameter?.Value;
  if (!value || value === PLACEHOLDER || value.length < JWT_SECRET_MIN_LENGTH) {
    throw new Error(
      `SSM parameter ${name} must be a random string of at least ${JWT_SECRET_MIN_LENGTH} characters`,
    );
  }
  cached = { key: new TextEncoder().encode(value), expiresAt: now + SECRET_CACHE_MS };
  return cached.key;
}

export async function signSession(user) {
  return new SignJWT({ role: user.role })
    .setProtectedHeader({ alg: ALG })
    .setSubject(user.userId)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(await getSecret());
}

// → { userId, role, issuedAt /* ms */ } | null. Callers compare issuedAt with the user's
// passwordChangedAt to reject sessions from before a password change. Bad, expired or foreign-signed tokens give null; a missing
// JWT_SECRET still throws, because that is a deployment error, not a bad token.
export async function verifySession(token) {
  const secret = await getSecret();
  if (typeof token !== 'string' || !token) return null;

  try {
    const { payload } = await jwtVerify(token, secret, { algorithms: [ALG] });
    if (typeof payload.sub !== 'string' || !payload.sub || !ROLES.includes(payload.role)) {
      return null;
    }
    return { userId: payload.sub, role: payload.role, issuedAt: payload.iat * 1000 };
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
