import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { getConfig, OutboundQueueMessageSchema } from '@vartalap/core';

let client;

function getClient() {
  client ??= new SQSClient({ region: getConfig().region });
  return client;
}

// Contract in M6: one FIFO group per chat keeps a chat's sends in order; dedup on messageId
// makes a retried enqueue of the same message a no-op.
// F3 Phase 3: the body and group id are phone-free ({ messageId, publicId }, group = publicId),
// so the queue and the DLQ never hold a client's number.
export async function sendOutbound({ messageId, publicId }) {
  if (!publicId) throw new Error('sendOutbound: chat has no publicId');
  const body = OutboundQueueMessageSchema.parse({ messageId, publicId });
  await getClient().send(
    new SendMessageCommand({
      QueueUrl: getConfig().outboundQueueUrl,
      MessageBody: JSON.stringify(body),
      MessageGroupId: body.publicId,
      MessageDeduplicationId: body.messageId,
    }),
  );
}
