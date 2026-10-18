const REQUIRED = {
  region: 'AWS_REGION',
  stage: 'STAGE',
  messagesTable: 'MESSAGES_TABLE',
  chatsTable: 'CHATS_TABLE',
  usersTable: 'USERS_TABLE',
  outboundQueueUrl: 'OUTBOUND_QUEUE_URL',
};

let cached;

// Validated on first use, so importing schemas alone never needs AWS env vars.
export function getConfig() {
  if (cached) return cached;

  const missing = Object.values(REQUIRED).filter((name) => !process.env[name]);
  if (missing.length) {
    throw new Error(`Missing required env vars: ${missing.join(', ')}`);
  }

  cached = Object.freeze(
    Object.fromEntries(Object.entries(REQUIRED).map(([key, name]) => [key, process.env[name]])),
  );
  return cached;
}

// F4: the ClientNotes table is used only by the web app, so it is not REQUIRED above (the
// Lambdas never set it and must not fail on its absence). Checked here, on first use.
export function getClientNotesTable() {
  const name = process.env.CLIENT_NOTES_TABLE;
  if (!name) {
    throw new Error(
      'Missing CLIENT_NOTES_TABLE; deploy the stack so /vartalap/<stage>/config/CLIENT_NOTES_TABLE exists',
    );
  }
  return name;
}
