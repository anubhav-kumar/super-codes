// F3: gives every existing chat an opaque publicId (new chats get one from appendMessage).
//   npm run backfill:public-ids -w @vartalap/scripts             (dry run: counts only)
//   npm run backfill:public-ids -w @vartalap/scripts -- --apply  (writes)
// Region comes from the shell (`assume`), the stage from STAGE (default dev), and table names
// from SSM, as for the seed script.
// Idempotent and safe while the webhook is live: each write is conditioned on the chat still
// having no publicId, so an id set concurrently by appendMessage is never replaced.
// Prints counts only, never phone numbers.
import { assignPublicIdIfMissing, chatIdsWithoutPublicId, loadConfigFromSsm } from '@vartalap/core';
import { useShellEnv } from './lib/shell-env.js';

async function main() {
  const apply = process.argv.includes('--apply');
  const { stage } = useShellEnv();
  console.log(`Stage "${stage}" in ${process.env.AWS_REGION}`);
  await loadConfigFromSsm();

  const counts = { found: 0, updated: 0, skipped: 0 };
  for await (const chatId of chatIdsWithoutPublicId()) {
    counts.found++;
    if (apply) counts[await assignPublicIdIfMissing(chatId)]++;
  }

  console.log(
    apply
      ? `Chats without publicId: ${counts.found}; updated ${counts.updated}, skipped ${counts.skipped} (set concurrently)`
      : `Dry run: ${counts.found} chats have no publicId. Re-run with --apply to write.`,
  );
}

main().catch((err) => {
  console.error(`Backfill failed: ${err.code ?? err.name}: ${err.message}`);
  process.exit(1);
});
