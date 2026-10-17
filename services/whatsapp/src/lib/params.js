import { GetParametersCommand, SSMClient } from '@aws-sdk/client-ssm';

// Value the stack creates each parameter with, until someone sets the real one.
export const PLACEHOLDER = 'CHANGE_ME';

// Values are cached per Lambda container; rotated values are picked up within this window.
const CACHE_TTL_MS = 5 * 60 * 1000;

let client;
const cache = new Map(); // parameter name → { value, expiresAt }

function getClient() {
  if (!client) client = new SSMClient({});
  return client;
}

// keys: e.g. ['WA_ACCESS_TOKEN']. Each key's SSM parameter name comes from env `<key>_PARAM`.
// → { WA_ACCESS_TOKEN: '<value>', ... }. Throws if a parameter is missing or still a placeholder.
export async function getParams(keys) {
  const names = keys.map((key) => {
    const name = process.env[`${key}_PARAM`];
    if (!name) throw new Error(`Missing env var ${key}_PARAM`);
    return name;
  });

  const now = Date.now();
  const stale = names.filter((name) => !(cache.get(name)?.expiresAt > now));
  if (stale.length) {
    const { Parameters = [], InvalidParameters = [] } = await getClient().send(
      new GetParametersCommand({ Names: stale, WithDecryption: true }),
    );
    if (InvalidParameters.length) {
      throw new Error(`SSM parameters not found: ${InvalidParameters.join(', ')}`);
    }
    for (const { Name, Value } of Parameters) {
      cache.set(Name, { value: Value, expiresAt: now + CACHE_TTL_MS });
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
