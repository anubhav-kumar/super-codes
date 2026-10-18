// Wipes a stage's data so it can start fresh. Keeps the stack, its SSM parameters (WA_*,
// JWT_SECRET) and the Meta webhook as they are.
//   npm run reset-data -w @vartalap/scripts                          (dry run: counts only)
//   npm run reset-data -w @vartalap/scripts -- --apply               (deletes)
//   npm run reset-data -w @vartalap/scripts -- --apply --keep-users  (keeps staff accounts)
// Region and credentials come from the shell (`assume` sets AWS_REGION / AWS_DEFAULT_REGION).
// The stage is the shell's STAGE, or dev when unset; .env.local is not read.
// Deletes every item in the Messages, Chats, Users and ClientNotes tables, every object in the
// media bucket, and purges the outbound and media-fetch queues and their DLQs. With --apply it
// also trims apps/web/.env.local to AWS_REGION and STAGE (everything else comes from SSM).
// Only runs on dev unless --stage <name> repeats the stage, so prod can't be wiped by a stray
// STAGE variable. Stop `npm run dev` first. After a reset without --keep-users, run
// `npm run seed -- <email> [name]` to create the first admin again.
// Prints counts only, never item contents.
import { readFile, writeFile } from 'node:fs/promises';
import {
  BatchWriteItemCommand,
  DescribeTableCommand,
  DynamoDBClient,
  ScanCommand,
} from '@aws-sdk/client-dynamodb';
import { DeleteObjectsCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';
import { GetQueueUrlCommand, PurgeQueueCommand, SQSClient } from '@aws-sdk/client-sqs';
import { SSM_CONFIG_KEYS, SSM_OPTIONAL_CONFIG_KEYS, loadConfigFromSsm } from '@vartalap/core';
import { useShellEnv } from './lib/shell-env.js';

const ENV_FILE = new URL('../apps/web/.env.local', import.meta.url);
const ENV_KEEP = ['AWS_REGION', 'STAGE'];
const BATCH_SIZE = 25; // BatchWriteItem limit

function parseArgs(argv) {
  const stageAt = argv.indexOf('--stage');
  return {
    apply: argv.includes('--apply'),
    keepUsers: argv.includes('--keep-users'),
    confirmedStage: stageAt === -1 ? null : argv[stageAt + 1],
  };
}

async function main() {
  const { apply, keepUsers, confirmedStage } = parseArgs(process.argv.slice(2));
  const { region, stage } = useShellEnv();
  if (stage !== 'dev' && confirmedStage !== stage) {
    throw new Error(`Refusing to wipe stage "${stage}". Re-run with --stage ${stage} to confirm.`);
  }

  // SSM is the source of truth: stale table names or queue URLs in the shell must not point
  // the wipe at the wrong resources.
  for (const key of [...SSM_CONFIG_KEYS, ...SSM_OPTIONAL_CONFIG_KEYS]) delete process.env[key];
  await loadConfigFromSsm();

  const dynamo = new DynamoDBClient({ region });
  const s3 = new S3Client({ region });
  const sqs = new SQSClient({ region });

  console.log(
    `${apply ? 'Resetting' : 'Dry run for'} stage "${stage}" in ${region ?? 'the default region'}`,
  );

  const tables = [
    process.env.MESSAGES_TABLE,
    process.env.CHATS_TABLE,
    keepUsers ? null : process.env.USERS_TABLE,
    process.env.CLIENT_NOTES_TABLE,
  ].filter(Boolean);
  for (const table of tables) {
    const count = await clearTable(dynamo, table, apply);
    console.log(`  table ${table}: ${count} items ${apply ? 'deleted' : 'found'}`);
  }
  if (keepUsers) console.log(`  table ${process.env.USERS_TABLE}: kept (--keep-users)`);

  if (process.env.MEDIA_BUCKET) {
    const count = await clearBucket(s3, process.env.MEDIA_BUCKET, apply);
    console.log(
      `  bucket ${process.env.MEDIA_BUCKET}: ${count} objects ${apply ? 'deleted' : 'found'}`,
    );
  } else {
    console.log('  media bucket: not in SSM, skipped');
  }

  for (const queue of await queueUrls(sqs, stage)) {
    console.log(
      `  queue ${queue.name}: ${apply ? await purgeQueue(sqs, queue.url) : 'would be purged'}`,
    );
  }

  console.log(`  ${await trimEnvFile(apply)}`);

  if (!apply) {
    console.log('Nothing was changed. Re-run with --apply to delete.');
  } else if (!keepUsers) {
    console.log('Done. Create the first admin again: npm run seed -- <email> [name]');
  } else {
    console.log('Done.');
  }
}

// Scans keys only and deletes in batches of 25, retrying anything DynamoDB leaves unprocessed.
async function clearTable(dynamo, table, apply) {
  const { Table } = await dynamo.send(new DescribeTableCommand({ TableName: table }));
  const keyNames = Table.KeySchema.map((k) => k.AttributeName);
  const names = Object.fromEntries(keyNames.map((name, i) => [`#k${i}`, name]));

  let count = 0;
  let ExclusiveStartKey;
  do {
    const page = await dynamo.send(
      new ScanCommand({
        TableName: table,
        ProjectionExpression: Object.keys(names).join(', '),
        ExpressionAttributeNames: names,
        ExclusiveStartKey,
      }),
    );
    const keys = page.Items ?? [];
    count += keys.length;
    if (apply) {
      for (let i = 0; i < keys.length; i += BATCH_SIZE) {
        await deleteBatch(dynamo, table, keys.slice(i, i + BATCH_SIZE));
      }
    }
    ExclusiveStartKey = page.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return count;
}

async function deleteBatch(dynamo, table, keys) {
  let requests = keys.map((Key) => ({ DeleteRequest: { Key } }));
  for (let attempt = 0; requests.length; attempt++) {
    if (attempt > 0) await sleep(Math.min(100 * 2 ** attempt, 3000));
    if (attempt > 8) throw new Error(`Could not delete ${requests.length} items from ${table}`);
    const res = await dynamo.send(
      new BatchWriteItemCommand({ RequestItems: { [table]: requests } }),
    );
    requests = res.UnprocessedItems?.[table] ?? [];
  }
}

// The bucket is not versioned, so deleting the current objects removes everything.
async function clearBucket(s3, bucket, apply) {
  let count = 0;
  let ContinuationToken;
  do {
    const page = await s3.send(new ListObjectsV2Command({ Bucket: bucket, ContinuationToken }));
    const objects = (page.Contents ?? []).map(({ Key }) => ({ Key }));
    count += objects.length;
    if (apply && objects.length) {
      const res = await s3.send(
        new DeleteObjectsCommand({ Bucket: bucket, Delete: { Objects: objects, Quiet: true } }),
      );
      if (res.Errors?.length) {
        throw new Error(`Could not delete ${res.Errors.length} objects: ${res.Errors[0].Code}`);
      }
    }
    ContinuationToken = page.NextContinuationToken;
  } while (ContinuationToken);
  return count;
}

// Queue names follow serverless.yml. A queue that doesn't exist yet is skipped.
async function queueUrls(sqs, stage) {
  const names = [
    `vartalap-${stage}-outbound.fifo`,
    `vartalap-${stage}-outbound-dlq.fifo`,
    `vartalap-${stage}-media-fetch`,
    `vartalap-${stage}-media-fetch-dlq`,
  ];
  const queues = [];
  for (const name of names) {
    try {
      const { QueueUrl } = await sqs.send(new GetQueueUrlCommand({ QueueName: name }));
      queues.push({ name, url: QueueUrl });
    } catch (err) {
      if (!String(err.name).includes('NonExistentQueue') && err.name !== 'QueueDoesNotExist') {
        throw err;
      }
      console.log(`  queue ${name}: does not exist, skipped`);
    }
  }
  return queues;
}

async function purgeQueue(sqs, url) {
  try {
    await sqs.send(new PurgeQueueCommand({ QueueUrl: url }));
    return 'purged';
  } catch (err) {
    // SQS allows one purge per queue per 60 s; the earlier purge is still emptying it.
    if (String(err.name).includes('PurgeQueueInProgress')) return 'purge already in progress';
    throw err;
  }
}

// .env.local is still needed for AWS_REGION and STAGE; anything else in it is stale and
// would override the values the stack publishes to SSM.
async function trimEnvFile(apply) {
  let text;
  try {
    text = await readFile(ENV_FILE, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return 'apps/web/.env.local: not found, skipped';
    throw err;
  }
  const lines = text.split('\n').filter((line) => /^\s*[A-Za-z_][A-Za-z0-9_]*\s*=/.test(line));
  const keyOf = (line) => line.split('=')[0].trim();
  const kept = lines.filter((line) => ENV_KEEP.includes(keyOf(line)));
  const removed = lines.map(keyOf).filter((key) => !ENV_KEEP.includes(key));

  if (!removed.length) return 'apps/web/.env.local: already only AWS_REGION and STAGE';
  if (!apply) return `apps/web/.env.local: would remove ${removed.join(', ')}`;
  await writeFile(ENV_FILE, `${kept.join('\n')}\n`, { mode: 0o600 });
  return `apps/web/.env.local: removed ${removed.join(', ')}`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((err) => {
  console.error(`Reset failed: ${err.code ?? err.name}: ${err.message}`);
  process.exit(1);
});
