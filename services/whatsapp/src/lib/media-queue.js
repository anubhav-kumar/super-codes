// F2: the webhook hands inbound media to the mediaFetch Lambda through a standard SQS queue.
// The body holds only the internal message ID; mediaFetch reads waMediaId from the message.
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { MediaFetchQueueMessageSchema } from '@vartalap/core';

let client;

export async function enqueueMediaFetch(messageId) {
  const queueUrl = process.env.MEDIA_FETCH_QUEUE_URL;
  if (!queueUrl) throw new Error('Missing env var MEDIA_FETCH_QUEUE_URL');
  client ??= new SQSClient({});
  const body = MediaFetchQueueMessageSchema.parse({ messageId });
  await client.send(new SendMessageCommand({ QueueUrl: queueUrl, MessageBody: JSON.stringify(body) }));
}
