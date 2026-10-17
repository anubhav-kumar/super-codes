// M6 sender: delivers queued outbound messages through the WhatsApp Cloud API.
// SQS FIFO, batchSize 1. Returning resolves the record; throwing makes SQS redeliver it,
// and after maxReceiveCount (3) receives SQS moves it to the DLQ.
import {
  OutboundQueueMessageSchema,
  getMessage,
  setWaMessageId,
  updateStatus,
} from '@vartalap/core';
import { WhatsAppSendError, sendText } from '../whatsapp/client.js';

// Keep in sync with maxReceiveCount on OutboundQueue in serverless.yml.
const MAX_RECEIVE_COUNT = 3;

// Error code stored on a message that failed for a reason other than a Cloud API error.
const INTERNAL_ERROR_CODE = 'INTERNAL';

export async function handler(event) {
  for (const record of event.Records ?? []) {
    await processRecord(record);
  }
}

async function processRecord(record) {
  const receiveCount = Number(record.attributes?.ApproximateReceiveCount ?? 1);
  const job = parseJob(record);
  if (!job) {
    log('warn', 'sender.malformed', { sqsMessageId: record.messageId });
    return; // Retrying would not fix it.
  }

  const ctx = { messageId: job.messageId, phone: lastFour(job.chatId), receiveCount };
  const message = await getMessage(job.messageId);
  if (!message) {
    log('warn', 'sender.not_found', ctx);
    return;
  }
  if (message.status !== 'pending') {
    log('info', 'sender.skipped', { ...ctx, status: message.status });
    return; // Already sent or failed: a redelivery.
  }

  let waMessageId;
  try {
    ({ waMessageId } = await sendText({ to: message.chatId, body: message.text }));
  } catch (err) {
    await handleSendFailure(err, ctx, receiveCount);
    return;
  }

  try {
    const { applied } = await setWaMessageId(job.messageId, waMessageId);
    log('info', 'sender.sent', { ...ctx, waMessageId, applied });
  } catch (err) {
    // WhatsApp already accepted the message. Throwing would redeliver and send it twice,
    // so record the failure for follow-up and resolve the record instead.
    log('error', 'sender.record_failed', { ...ctx, waMessageId, error: describe(err) });
  }
}

function parseJob(record) {
  try {
    const result = OutboundQueueMessageSchema.safeParse(JSON.parse(record.body));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

async function handleSendFailure(err, ctx, receiveCount) {
  const isSendError = err instanceof WhatsAppSendError;
  const errorCode = isSendError ? err.code : INTERNAL_ERROR_CODE;
  const details = { ...ctx, errorCode, httpStatus: isSendError ? err.status : null };

  if (isSendError && !err.retryable) {
    const { applied } = await updateStatus({
      messageId: ctx.messageId,
      status: 'failed',
      errorCode,
    });
    log('warn', 'sender.failed', { ...details, applied, error: err.message });
    return;
  }

  // Retryable, or an unexpected error (e.g. SSM settings still unset): let SQS retry.
  if (receiveCount >= MAX_RECEIVE_COUNT) {
    // Last attempt: mark it failed so the UI shows it; the payload still goes to the DLQ.
    await updateStatus({ messageId: ctx.messageId, status: 'failed', errorCode }).catch(
      (updateErr) =>
        log('error', 'sender.mark_failed_error', { ...details, error: describe(updateErr) }),
    );
    log('error', 'sender.giving_up', { ...details, error: describe(err) });
  } else {
    log('warn', 'sender.retrying', { ...details, error: describe(err) });
  }
  throw err;
}

// Phone numbers are personal data: log only the last 4 digits.
function lastFour(phone) {
  return typeof phone === 'string' ? `***${phone.slice(-4)}` : null;
}

function describe(err) {
  return { name: err?.name, message: err?.message };
}

// One JSON line per event. Never pass message text, full phone numbers or tokens here.
function log(level, event, fields) {
  const line = JSON.stringify({ level, event, ...fields });
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}
