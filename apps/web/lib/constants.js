// Browser-safe copies of @vartalap/core constants. The core entry point pulls in the AWS SDK
// and bcrypt, so client components must not import it. Keep these in sync with
// packages/core/src/schemas (chat.js UNASSIGNED, message.js MESSAGE_TEXT_MAX, user.js limits).
export const UNASSIGNED = 'UNASSIGNED';
export const MESSAGE_TEXT_MAX = 4096;
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_BYTES = 72;
