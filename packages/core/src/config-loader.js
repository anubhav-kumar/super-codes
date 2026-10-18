import { GetParametersByPathCommand, SSMClient } from '@aws-sdk/client-ssm';

// Non-secret settings the stack publishes to SSM (/vartalap/<stage>/config/<KEY>), so local
// processes (web app, seed script) need only AWS_REGION and STAGE. Lambdas get these from
// serverless.yml env instead and never call this.
export const SSM_CONFIG_KEYS = [
  'MESSAGES_TABLE',
  'CHATS_TABLE',
  'USERS_TABLE',
  'OUTBOUND_QUEUE_URL',
];

// Keys loaded when present but never required at startup: a feature's config may be missing
// until its stack change is deployed, and only the code that uses it checks it (on use).
export const SSM_OPTIONAL_CONFIG_KEYS = [
  // F4: ClientNotes table (web app only; see getClientNotesTable in config.js).
  'CLIENT_NOTES_TABLE',
  // F2: media bucket and the GuardDuty clean-tag switch (web app; see media/config.js).
  'MEDIA_BUCKET',
  'MEDIA_SCAN_REQUIRED',
];

export function configPath(stage = process.env.STAGE) {
  return `/vartalap/${stage}/config/`;
}

// Fills process.env from SSM before getConfig() is first used. A variable that is already
// set wins, so a local override still works. Throws when a key is neither set nor in SSM.
export async function loadConfigFromSsm() {
  const missing = () => SSM_CONFIG_KEYS.filter((key) => !process.env[key]);
  const optionalMissing = SSM_OPTIONAL_CONFIG_KEYS.filter((key) => !process.env[key]);
  if (!missing().length && !optionalMissing.length) return;

  if (!process.env.STAGE) {
    if (!missing().length) return; // only optional keys wanted
    throw new Error('STAGE must be set to load config from SSM');
  }
  const path = configPath();

  const found = {};
  try {
    const client = new SSMClient({});
    let NextToken;
    do {
      const page = await client.send(
        new GetParametersByPathCommand({ Path: path, WithDecryption: true, NextToken }),
      );
      for (const { Name, Value } of page.Parameters ?? []) found[Name.slice(path.length)] = Value;
      NextToken = page.NextToken;
    } while (NextToken);
  } catch (err) {
    // Only optional keys were wanted: leave them unset, their getters report it on use.
    if (!missing().length) return;
    throw new Error(`Could not read config from SSM ${path}: ${err.name}`, { cause: err });
  }

  for (const key of [...SSM_CONFIG_KEYS, ...SSM_OPTIONAL_CONFIG_KEYS]) {
    if (!process.env[key] && found[key]) process.env[key] = found[key];
  }

  const stillMissing = missing();
  if (stillMissing.length) {
    throw new Error(
      `Missing config ${stillMissing.join(', ')} under SSM ${path} in ${process.env.AWS_REGION ?? 'the default region'}; deploy the stack for this stage`,
    );
  }
}
