import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { getConfig, OutboundQueueMessageSchema } from '@vartalap/core';

let client;

function getClient() {
  client ??= new SQSClient({ region: getConfig().region });
  return client;
}

// Contract in M6: one FIFO group per chat keeps a chat's sends in order; dedup on messageId
// makes a retried enqueue of the same message a no-op.
export async function sendOutbound({ messageId, chatId }) {
  const body = OutboundQueueMessageSchema.parse({ messageId, chatId });
  await getClient().send(
    new SendMessageCommand({
      QueueUrl: getConfig().outboundQueueUrl,
      MessageBody: JSON.stringify(body),
      MessageGroupId: body.chatId,
      MessageDeduplicationId: body.messageId,
    }),
  );
}
