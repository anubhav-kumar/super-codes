import { readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';

// Local processes (web app, scripts) take the region from the shell (`assume` sets AWS_REGION
// and AWS_DEFAULT_REGION) and STAGE from the repo root .env. Everything else comes from SSM.
// No AWS SDK imports here, so next.config.mjs can load this (@vartalap/core/env) cheaply.

// Copies the file's variables into process.env. A variable already set (by the shell) wins.
// A missing file is fine: STAGE may come from the shell instead.
export function loadRootEnv(file) {
  let text;
  try {
    text = readFileSync(file, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return;
    throw err;
  }
  for (const [key, value] of Object.entries(parseEnv(text))) {
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

// → the shell's region, also written to AWS_REGION (the variable the AWS SDK reads).
// Pass { required: false } where a missing region must not fail (e.g. next build).
export function useShellRegion({ required = true } = {}) {
  const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION;
  if (region) process.env.AWS_REGION = region;
  else if (required) throw new Error('No AWS region in the shell; run `assume` first');
  return region;
}
