// F2 (P4): deletes every stored media file of one chat, for a client data-deletion request
// (GDPR / PDPA / PDPL). Message texts stay; each file's media.state becomes 'expired', so the
// UI shows "Media expired". Usage (needs AWS_REGION and STAGE, like the seed script):
//   npm run delete-client-media -w @vartalap/scripts -- <chat id from the URL> [--yes]
// Without --yes it only counts what it would delete. Never logs keys, captions or filenames.
import { DeleteObjectCommand, S3Client } from '@aws-sdk/client-s3';
import {
  getChatIdByPublicId,
  getMediaConfig,
  loadConfigFromSsm,
  readMessages,
  setMediaState,
} from '@vartalap/core';

const PAGE = 100;

async function main() {
  const [publicId, flag] = process.argv.slice(2);
  if (!publicId) {
    console.error('Usage: npm run delete-client-media -- <chat id> [--yes]');
    process.exit(1);
  }
  const apply = flag === '--yes';

  await loadConfigFromSsm();
  const chatId = await getChatIdByPublicId(publicId);
  if (!chatId) {
    console.error('Chat not found');
    process.exit(1);
  }

  const { bucket } = getMediaConfig();
  const s3 = new S3Client({});
  let before;
  let found = 0;
  let deleted = 0;
  do {
    const page = await readMessages({ chatId, before, limit: PAGE });
    for (const message of page.messages) {
      const key = message.media?.s3Key;
      if (!key) continue;
      found++;
      if (!apply) continue;
      await s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
      await setMediaState(message.messageId, { state: 'expired', errorCode: 'DELETED' });
      deleted++;
    }
    before = page.nextBefore;
  } while (before);

  console.log(
    apply
      ? `Deleted ${deleted} media file(s) for chat ${publicId}`
      : `Found ${found} media file(s) for chat ${publicId}; re-run with --yes to delete them`,
  );
}

main().catch((err) => {
  console.error(`Failed: ${err.name}: ${err.message}`);
  process.exit(1);
});
