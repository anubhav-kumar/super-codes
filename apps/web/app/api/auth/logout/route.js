import { noContent, withHandler } from '../../../../lib/api.js';
import { buildClearCookie } from '../../../../lib/session.js';

export const runtime = 'nodejs';

// No session check: clearing the cookie is always safe, even for an expired session.
export const POST = withHandler(async () => noContent({ 'Set-Cookie': buildClearCookie() }));
