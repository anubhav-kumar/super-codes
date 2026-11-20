'use strict';

const { middleware, http } = require('common');

/**
 * GET /auth/me
 * 200 { user: { id, email, name }, expiresAt }
 * 401 UNAUTHORIZED (from withHandler)
 */
module.exports.handler = middleware.withHandler(async ({ session }) =>
    http.ok(
        { user: { id: session.userId, email: session.email, name: session.name }, expiresAt: session.expiresAt },
        { 'Cache-Control': 'no-store' }
    )
);
