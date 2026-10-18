// F2 media settings. Kept out of getConfig()'s REQUIRED set so runtimes that don't touch media
// (and stacks deployed before F2) never fail on them; media code paths call this instead.
//   MEDIA_BUCKET            S3 bucket for in/ and out/ objects (Lambdas: env; web: SSM config)
//   MEDIA_FETCH_QUEUE_URL   SQS queue the webhook feeds (webhook Lambda env only)
//   MEDIA_SCAN_REQUIRED     'false' turns off the GuardDuty clean-tag check (default: required)
export function getMediaConfig() {
  const bucket = process.env.MEDIA_BUCKET;
  if (!bucket) throw new Error('Missing required env var: MEDIA_BUCKET');
  return {
    bucket,
    fetchQueueUrl: process.env.MEDIA_FETCH_QUEUE_URL || null,
    scanRequired: process.env.MEDIA_SCAN_REQUIRED !== 'false',
  };
}

export function isMediaConfigured() {
  return Boolean(process.env.MEDIA_BUCKET);
}

// GuardDuty Malware Protection for S3 writes this tag on every scanned object.
export const SCAN_TAG_KEY = 'GuardDutyMalwareScanStatus';
export const SCAN_CLEAN = 'NO_THREATS_FOUND';
export const SCAN_INFECTED = 'THREATS_FOUND';

// S3 keys hold only the internal ULID message ID: never a phone number, wamid or Meta media ID.
export function inboundMediaKey(messageId) {
  return `in/${messageId}`;
}

export function outboundMediaKey(messageId) {
  return `out/${messageId}`;
}

// Retention (decision D4): S3 lifecycle expires objects after this many days; the UI then shows
// the media as expired. Keep in sync with the bucket lifecycle rule in serverless.yml.
export const MEDIA_RETENTION_DAYS = 90;
