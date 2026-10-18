// F2: S3 helpers for the media bucket (mediaFetch writes in/, the sender reads out/).
import {
  DeleteObjectCommand,
  GetObjectCommand,
  GetObjectTaggingCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { SCAN_TAG_KEY, getMediaConfig } from '@vartalap/core';

let client;

function s3() {
  client ??= new S3Client({});
  return client;
}

// Streams `body` (a Node Readable) to the bucket without buffering the whole file.
export async function uploadStream({ key, body, contentType }) {
  const upload = new Upload({
    client: s3(),
    params: { Bucket: getMediaConfig().bucket, Key: key, Body: body, ContentType: contentType },
    queueSize: 2,
    partSize: 8 * 1024 * 1024,
  });
  await upload.done();
}

export async function deleteObject(key) {
  await s3().send(new DeleteObjectCommand({ Bucket: getMediaConfig().bucket, Key: key }));
}

// → { data: Uint8Array, contentType, size }. Only for outbound files (≤ 16 MB, decision D3).
export async function getObjectBytes(key) {
  const res = await s3().send(new GetObjectCommand({ Bucket: getMediaConfig().bucket, Key: key }));
  const data = await res.Body.transformToByteArray();
  return { data, contentType: res.ContentType ?? null, size: data.length };
}

// GuardDuty Malware Protection's tag value, or null while the object hasn't been scanned yet.
export async function getScanStatus(key) {
  const { TagSet = [] } = await s3().send(
    new GetObjectTaggingCommand({ Bucket: getMediaConfig().bucket, Key: key }),
  );
  return TagSet.find((t) => t.Key === SCAN_TAG_KEY)?.Value ?? null;
}
