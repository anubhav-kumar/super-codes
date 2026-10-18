import { GetParametersCommand, SSMClient } from '@aws-sdk/client-ssm';

// Value the stack creates each parameter with, until someone sets the real one.
export const PLACEHOLDER = 'CHANGE_ME';

// Values are cached per Lambda container; rotated values are picked up within this window.
// I3 demo: WA_PARAMS_CACHE_SECONDS shortens it, so a number connected from the web app (which
// overwrites WA_PHONE_NUMBER_ID / WA_ACCESS_TOKEN) is picked up by warm containers quickly.
const DEFAULT_CACHE_TTL_MS = 5 * 60 * 1000;

function cacheTtlMs() {
  const seconds = Number(process.env.WA_PARAMS_CACHE_SECONDS);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds * 1000 : DEFAULT_CACHE_TTL_MS;
}

let client;
const cache = new Map(); // parameter name → { value, expiresAt }

function getClient() {
  if (!client) client = new SSMClient({});
  return client;
}

// keys: e.g. ['WA_ACCESS_TOKEN']. Each key's SSM parameter name comes from env `<key>_PARAM`.
// → { WA_ACCESS_TOKEN: '<value>', ... }. Throws if a parameter is missing or still a placeholder.
// fresh: true skips the cache (I3: the webhook re-reads the number ID when it sees another one).
export async function getParams(keys, { fresh = false } = {}) {
  const names = keys.map((key) => {
    const name = process.env[`${key}_PARAM`];
    if (!name) throw new Error(`Missing env var ${key}_PARAM`);
    return name;
  });

  const now = Date.now();
  const stale = fresh ? names : names.filter((name) => !(cache.get(name)?.expiresAt > now));
  if (stale.length) {
    const { Parameters = [], InvalidParameters = [] } = await getClient().send(
      new GetParametersCommand({ Names: stale, WithDecryption: true }),
    );
    if (InvalidParameters.length) {
      throw new Error(`SSM parameters not found: ${InvalidParameters.join(', ')}`);
    }
    for (const { Name, Value } of Parameters) {
      cache.set(Name, { value: Value, expiresAt: now + cacheTtlMs() });
    }
  }

  return Object.fromEntries(
    keys.map((key, i) => {
      const { value } = cache.get(names[i]);
      if (value === PLACEHOLDER) {
        throw new Error(`SSM parameter ${names[i]} is still the placeholder; set its real value`);
      }
      return [key, value];
    }),
  );
}
