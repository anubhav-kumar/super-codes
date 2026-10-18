export { getConfig } from './config.js';
export { SSM_CONFIG_KEYS, configPath, loadConfigFromSsm } from './config-loader.js';
export { getDocClient } from './db/client.js';
export { AppError, ERROR_CODES, ERROR_HTTP_STATUS } from './errors.js';

export * from './schemas/common.js';
export * from './schemas/message.js';
export * from './schemas/chat.js';
export * from './schemas/user.js';
export * from './schemas/api.js';

export * from './messages/index.js';
export * from './users/index.js';
export * from './chats/index.js';
export * from './access.js';

// F4: client attributes (description, tags, notes) and tag catalog.
export { getClientNotesTable } from './config.js';
export { SSM_OPTIONAL_CONFIG_KEYS } from './config-loader.js';
export * from './schemas/client.js';
export * from './clients/index.js';

// F2: media messages (kinds, limits, sniffing, summaries, media config and updates).
export * from './schemas/media.js';
export * from './media/index.js';

// I3 demo: WhatsApp onboarding (Embedded Signup) request bodies.
export * from './schemas/wa-onboarding.js';
