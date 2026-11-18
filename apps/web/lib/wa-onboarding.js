// I3 demo: self-serve WhatsApp number onboarding through Meta Embedded Signup (v4), server side.
// DEMO ONLY, not production ready (see docs/demo-whatsapp-onboarding.md):
//   - single tenant: the connected number replaces the one in WA_PHONE_NUMBER_ID /
//     WA_ACCESS_TOKEN, which the webhook, sender and mediaFetch Lambdas already read;
//   - the Meta app stays in development mode, so only people with a role on it can onboard;
//   - the business token and PIN live in SSM SecureString parameters, not a secret store (I6).
// Nothing here ever returns, logs or puts in an error the business token, the code or the PIN.
import { randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import {
  DeleteParameterCommand,
  GetParametersCommand,
  PutParameterCommand,
  SSMClient,
} from '@aws-sdk/client-ssm';
import { AppError } from '@vartalap/core';

const GRAPH_BASE_URL = 'https://graph.facebook.com';
// The stack publishes waGraphVersion to SSM config/WA_GRAPH_VERSION (loaded at startup); this
// is only the fallback for a stack deployed before that parameter existed.
const DEFAULT_GRAPH_VERSION = 'v26.0';
const REQUEST_TIMEOUT_MS = 15_000;
const PLACEHOLDER = 'CHANGE_ME';

export const STATE_COOKIE = 'vartalap_wa_state';
const STATE_TTL_SECONDS = 15 * 60;

// Stack parameters the Lambdas read (created by serverless.yml with a placeholder).
const LIVE_KEYS = ['WA_PHONE_NUMBER_ID', 'WA_ACCESS_TOKEN'];
// Public IDs of the Meta app (not secrets), also created by the stack with a placeholder.
const META_KEYS = ['META_APP_ID', 'META_ES_CONFIG_ID'];
// Created here, as SecureString:
//   CONNECTION  the current onboarding attempt or connected number (incl. token and PIN)
//   PREVIOUS    the manually configured number and token from before the first connect
//   PINS        { phoneNumberId: pin } so a number can be registered again after a disconnect
const CONNECTION = 'onboarding/CONNECTION';
const PREVIOUS = 'onboarding/PREVIOUS';
const PINS = 'onboarding/PINS';

// A connection's `step` is the last step completed; a failed attempt resumes after it.
const STEPS = ['exchanged', 'verified', 'subscribed', 'registered', 'live'];

let ssm;
function getSsm() {
  ssm ??= new SSMClient({});
  return ssm;
}

function paramName(key) {
  if (!process.env.STAGE) throw new Error('STAGE must be set');
  return `/vartalap/${process.env.STAGE}/${key}`;
}

function graphVersion() {
  return process.env.WA_GRAPH_VERSION || DEFAULT_GRAPH_VERSION;
}

// ---- SSM ----------------------------------------------------------------------------------

// Public settings for the browser (the app ID and configuration ID are not secrets), read from
// SSM on each call so a value set with put-parameter applies without a restart.
// `missing` lists the full parameter names still unset or placeholder.
export async function onboardingConfig() {
  const { META_APP_ID: appId, META_ES_CONFIG_ID: configId } = await readParams(META_KEYS);
  const missing = [!appId && 'META_APP_ID', !configId && 'META_ES_CONFIG_ID']
    .filter(Boolean)
    .map(paramName);
  return { appId, configId, graphVersion: graphVersion(), ready: !missing.length, missing };
}

// → { key: value | null }; null when missing or still the placeholder.
async function readParams(keys) {
  const names = keys.map(paramName);
  const { Parameters = [] } = await getSsm().send(
    new GetParametersCommand({ Names: names, WithDecryption: true }),
  );
  const byName = new Map(Parameters.map(({ Name, Value }) => [Name, Value]));
  return Object.fromEntries(
    keys.map((key, i) => {
      const value = byName.get(names[i]);
      return [key, value && value !== PLACEHOLDER ? value : null];
    }),
  );
}

async function readJson(key) {
  const { [key]: value } = await readParams([key]);
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

// Stack parameters keep their type (String); ours are SecureString (default aws/ssm key).
async function writeParam(key, value, { secure = false } = {}) {
  await getSsm().send(
    new PutParameterCommand({
      Name: paramName(key),
      Value: value,
      Overwrite: true,
      ...(secure ? { Type: 'SecureString' } : {}),
    }),
  );
}

const writeJson = (key, value) => writeParam(key, JSON.stringify(value), { secure: true });

async function deleteParam(key) {
  try {
    await getSsm().send(new DeleteParameterCommand({ Name: paramName(key) }));
  } catch (err) {
    if (err?.name !== 'ParameterNotFound') throw err;
  }
}

// ---- Graph API ----------------------------------------------------------------------------

// → parsed JSON. Throws AppError META_ERROR with Meta's own message (it never echoes tokens).
async function graph(path, { method = 'GET', token, query, body } = {}) {
  const url = new URL(`${GRAPH_BASE_URL}/${graphVersion()}/${path}`);
  for (const [key, value] of Object.entries(query ?? {})) url.searchParams.set(key, value);

  let res;
  try {
    res = await fetch(url, {
      method,
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      cache: 'no-store',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new AppError('META_ERROR', 'Could not reach Meta (graph.facebook.com)');
  }

  const payload = await res.json().catch(() => null);
  if (!res.ok || payload?.error) {
    const error = payload?.error ?? {};
    const text = error.error_user_msg || error.message || `HTTP ${res.status}`;
    throw new AppError('META_ERROR', `Meta: ${text}`, {
      metaCode: error.code ?? null,
      metaSubcode: error.error_subcode ?? null,
    });
  }
  return payload;
}

async function appCredentials() {
  const { appId } = await onboardingConfig();
  if (!appId) {
    throw new AppError('VALIDATION', `Set the Meta app ID in SSM ${paramName('META_APP_ID')}`);
  }
  const { WA_APP_SECRET } = await readParams(['WA_APP_SECRET']);
  if (!WA_APP_SECRET) {
    throw new AppError(
      'VALIDATION',
      `Set the Meta app secret in SSM ${paramName('WA_APP_SECRET')}`,
    );
  }
  return { appId, appSecret: WA_APP_SECRET };
}

// Meta's "Error validating verification code" (redirect_uri mismatch).
const REDIRECT_MISMATCH_SUBCODE = 36008;

// Exchangeable code from Embedded Signup → business integration system user token.
// The code is single use and expires about 30 s after the popup returns it.
// Meta's docs exchange it with no redirect_uri. Some apps get a redirect_uri mismatch
// (subcode 36008) instead, so the demo then retries with the URLs the code may be bound to:
// the settings page and the site root (the redirect URI listed in the Meta app).
async function exchangeCode(code, origin) {
  const { appId, appSecret } = await appCredentials();
  const redirectUris = [
    undefined,
    ...(origin ? [`${origin}/admin/whatsapp`, `${origin}/`] : []),
  ];
  let lastError;
  for (const redirectUri of redirectUris) {
    try {
      const { access_token: token } = await graph('oauth/access_token', {
        query: {
          client_id: appId,
          client_secret: appSecret,
          code,
          ...(redirectUri ? { redirect_uri: redirectUri } : {}),
        },
      });
      if (!token) throw new AppError('META_ERROR', 'Meta: no access token in the code exchange');
      // Demo diagnostics: which variant worked (a URL of this app, not a secret).
      console.info('wa_onboarding_code_exchanged', { redirectUri: redirectUri ?? 'none' });
      return token;
    } catch (err) {
      if (err?.details?.metaSubcode !== REDIRECT_MISMATCH_SUBCODE) throw err;
      lastError = err;
    }
  }
  throw lastError;
}

// What the token was granted: its scopes and the WABAs (used when the browser did not get the
// session info event). Never includes the token itself.
async function tokenGrants(token) {
  const { appId, appSecret } = await appCredentials();
  const { data } = await graph('debug_token', {
    query: { input_token: token, access_token: `${appId}|${appSecret}` },
  });
  const scope = (data?.granular_scopes ?? []).find(
    (s) => s.scope === 'whatsapp_business_management',
  );
  return {
    type: data?.type ?? null,
    scopes: data?.scopes ?? [],
    wabaIds: (scope?.target_ids ?? []).map(String),
  };
}

async function grantedWabaIds(token) {
  return (await tokenGrants(token)).wabaIds;
}

async function listNumbers(wabaId, token) {
  const { data } = await graph(`${wabaId}/phone_numbers`, {
    token,
    query: { fields: 'id,display_phone_number,verified_name' },
  });
  return data ?? [];
}

// Optional phone number fields, read one by one: an unknown or deprecated field fails the
// whole request, and none of these is essential for the demo.
const OPTIONAL_NUMBER_FIELDS = [
  'name_status',
  'code_verification_status',
  'platform_type',
  'status',
  'throughput',
  'whatsapp_business_manager_messaging_limit',
];

async function numberDetails(phoneNumberId, token) {
  const base = await graph(phoneNumberId, {
    token,
    query: { fields: 'id,display_phone_number,verified_name,quality_rating' },
  });
  const extras = await Promise.allSettled(
    OPTIONAL_NUMBER_FIELDS.map((field) =>
      graph(phoneNumberId, { token, query: { fields: field } }),
    ),
  );
  const details = {
    displayPhoneNumber: base.display_phone_number ?? null,
    verifiedName: base.verified_name ?? null,
    qualityRating: base.quality_rating ?? null,
  };
  extras.forEach((result, i) => {
    if (result.status !== 'fulfilled') return;
    const value = result.value[OPTIONAL_NUMBER_FIELDS[i]];
    if (value === undefined) return;
    const camel = OPTIONAL_NUMBER_FIELDS[i].replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    details[camel] = typeof value === 'object' ? (value.level ?? value.tier ?? value) : value;
  });
  return details;
}

// ---- Steps --------------------------------------------------------------------------------

// The IDs may come from the browser, so they are checked against what the token can see.
async function verifyAssets(conn) {
  const grants = conn.wabaId ? null : await tokenGrants(conn.token);
  const wabaIds = conn.wabaId ? [conn.wabaId] : grants.wabaIds;
  if (!wabaIds.length) {
    // Demo diagnostics: say what the token does have (scopes only, never the token).
    throw new AppError(
      'META_ERROR',
      'Meta: no WhatsApp Business Account was shared in signup ' +
        `(the browser got no signup-finished event; token type ${grants.type ?? 'unknown'}, ` +
        `scopes: ${grants.scopes.join(', ') || 'none'})`,
    );
  }
  if (conn.wabaId) {
    // An empty grant list is not proof either way (app admins may get none); the number
    // check below still has to pass with this token.
    const granted = await grantedWabaIds(conn.token).catch(() => []);
    if (granted.length && !granted.includes(conn.wabaId)) {
      throw new AppError('FORBIDDEN', 'That WhatsApp Business Account was not shared with the app');
    }
  }

  for (const wabaId of wabaIds) {
    const numbers = await listNumbers(wabaId, conn.token);
    const match = conn.phoneNumberId
      ? numbers.find((n) => String(n.id) === conn.phoneNumberId)
      : numbers.length === 1
        ? numbers[0]
        : null;
    if (match) {
      conn.wabaId = wabaId;
      conn.phoneNumberId = String(match.id);
      conn.displayPhoneNumber = match.display_phone_number ?? null;
      conn.verifiedName = match.verified_name ?? null;
      return;
    }
  }
  throw new AppError(
    'VALIDATION',
    conn.phoneNumberId
      ? 'That phone number is not in the shared WhatsApp Business Account'
      : 'Could not tell which phone number to connect; run the signup again and pick one number',
  );
}

async function subscribeApp(conn) {
  await graph(`${conn.wabaId}/subscribed_apps`, { method: 'POST', token: conn.token });
}

async function registerNumber(conn) {
  const pins = (await readJson(PINS)) ?? {};
  // A number registered before keeps its two-step verification PIN.
  conn.pin = pins[conn.phoneNumberId] ?? conn.pin;
  await graph(`${conn.phoneNumberId}/register`, {
    method: 'POST',
    token: conn.token,
    body: { messaging_product: 'whatsapp', pin: conn.pin },
  });
  await writeJson(PINS, { ...pins, [conn.phoneNumberId]: conn.pin });
}

// Points the Lambdas at the new number. The manually configured number is kept once, so a
// disconnect can restore it.
async function goLive(conn) {
  const current = await readParams(LIVE_KEYS);
  const previous = await readJson(PREVIOUS);
  if (
    !previous &&
    current.WA_PHONE_NUMBER_ID &&
    current.WA_PHONE_NUMBER_ID !== conn.phoneNumberId
  ) {
    await writeJson(PREVIOUS, {
      phoneNumberId: current.WA_PHONE_NUMBER_ID,
      accessToken: current.WA_ACCESS_TOKEN,
      savedAt: new Date().toISOString(),
    });
  }
  await writeParam('WA_ACCESS_TOKEN', conn.token);
  await writeParam('WA_PHONE_NUMBER_ID', conn.phoneNumberId);
  conn.status = 'connected';
  conn.connectedAt = new Date().toISOString();
}

const RUNNERS = {
  verified: verifyAssets,
  subscribed: subscribeApp,
  registered: registerNumber,
  live: goLive,
};

async function runSteps(conn) {
  for (let i = STEPS.indexOf(conn.step) + 1; i < STEPS.length; i++) {
    const step = STEPS[i];
    try {
      await RUNNERS[step](conn);
    } catch (err) {
      conn.lastError = { step, message: err?.message ?? 'Failed' };
      await writeJson(CONNECTION, conn);
      throw err;
    }
    conn.step = step;
    conn.lastError = null;
    await writeJson(CONNECTION, conn);
  }
  return conn;
}

// ---- Public API ---------------------------------------------------------------------------

// Never includes the token or the PIN.
function toConnectionView(conn) {
  if (!conn) return null;
  const { token, pin, ...view } = conn; // eslint-disable-line no-unused-vars
  return view;
}

export function newState() {
  return randomBytes(24).toString('hex');
}

export function stateCookie(value, request) {
  const secure = request.nextUrl.protocol === 'https:';
  return [
    `${STATE_COOKIE}=${value}`,
    'Path=/api/wa',
    `Max-Age=${value ? STATE_TTL_SECONDS : 0}`,
    'HttpOnly',
    'SameSite=Strict',
    ...(secure ? ['Secure'] : []),
  ].join('; ');
}

function sameState(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || !a) return false;
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

// Settings page data: config, the onboarding record and the number the Lambdas use now.
export async function onboardingStatus() {
  const [conn, live, previous] = await Promise.all([
    readJson(CONNECTION),
    readParams(LIVE_KEYS),
    readJson(PREVIOUS),
  ]);

  const phoneNumberId = live.WA_PHONE_NUMBER_ID;
  const source = !phoneNumberId
    ? 'none'
    : conn?.status === 'connected' && conn.phoneNumberId === phoneNumberId
      ? 'embedded_signup'
      : 'manual';

  let number = null;
  let numberError = null;
  if (phoneNumberId && live.WA_ACCESS_TOKEN) {
    try {
      number = await numberDetails(phoneNumberId, live.WA_ACCESS_TOKEN);
    } catch (err) {
      numberError = err?.message ?? 'Could not read the number from Meta';
    }
  }

  return {
    config: await onboardingConfig(),
    connection: toConnectionView(conn),
    active: { source, phoneNumberId, number, numberError },
    canRestorePrevious: Boolean(previous),
  };
}

export async function completeOnboarding({
  code,
  state,
  cookieState,
  wabaId,
  phoneNumberId,
  user,
  origin,
}) {
  if (!sameState(state, cookieState)) {
    throw new AppError('FORBIDDEN', 'This signup session expired; reload the page and try again');
  }
  const existing = await readJson(CONNECTION);
  if (existing?.status === 'connected') {
    throw new AppError('CONFLICT', 'A number is already connected; disconnect it first');
  }

  const token = await exchangeCode(code, origin);
  const conn = {
    status: 'pending',
    step: 'exchanged',
    wabaId: wabaId ?? null,
    phoneNumberId: phoneNumberId ?? null,
    displayPhoneNumber: null,
    verifiedName: null,
    token,
    pin: String(randomInt(0, 1_000_000)).padStart(6, '0'),
    startedAt: new Date().toISOString(),
    startedBy: user.userId,
    connectedAt: null,
    lastError: null,
  };
  await writeJson(CONNECTION, conn);
  return toConnectionView(await runSteps(conn));
}

// Resumes a failed attempt from its last completed step (the code is not needed again).
export async function retryOnboarding({ pin }) {
  const conn = await readJson(CONNECTION);
  if (!conn) throw new AppError('NOT_FOUND', 'No onboarding in progress');
  if (conn.status === 'connected') return toConnectionView(conn);
  if (pin) {
    // The number already has a two-step verification PIN (set outside Vartalap).
    const pins = (await readJson(PINS)) ?? {};
    if (conn.phoneNumberId) await writeJson(PINS, { ...pins, [conn.phoneNumberId]: pin });
    conn.pin = pin;
  }
  return toConnectionView(await runSteps(conn));
}

// Unsubscribes the app from the WABA and puts back the manually configured number, if any.
// The number stays registered with the Cloud API (its PIN is kept), so it can be reconnected.
export async function disconnectNumber() {
  const conn = await readJson(CONNECTION);
  if (!conn) throw new AppError('NOT_FOUND', 'No number was connected through signup');

  const warnings = [];
  if (STEPS.indexOf(conn.step) >= STEPS.indexOf('subscribed')) {
    try {
      await graph(`${conn.wabaId}/subscribed_apps`, { method: 'DELETE', token: conn.token });
    } catch (err) {
      warnings.push(`Could not unsubscribe the app from the WABA (${err.message})`);
    }
  }

  let restored = false;
  if (conn.step === 'live') {
    const current = await readParams(['WA_PHONE_NUMBER_ID']);
    // Only touch the live settings if they still point at this connection.
    if (current.WA_PHONE_NUMBER_ID === conn.phoneNumberId) {
      const previous = await readJson(PREVIOUS);
      await writeParam('WA_ACCESS_TOKEN', previous?.accessToken || PLACEHOLDER);
      await writeParam('WA_PHONE_NUMBER_ID', previous?.phoneNumberId || PLACEHOLDER);
      restored = Boolean(previous);
      if (previous) await deleteParam(PREVIOUS);
    }
  }
  await deleteParam(CONNECTION);
  return { restored, warnings };
}
