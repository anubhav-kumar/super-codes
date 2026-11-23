'use strict';

const { middleware, http } = require('common');
const { sessionUser } = require('../utils/user');

/**
 * GET /auth/me  (allowed while a temporary password is active)
 * 200 { user: { id, email, name, isAdmin, workerId, workerName, mustChangePassword }, expiresAt }
 * The user is read from the Users table on this request (withHandler), so name, email, role and
 * Worker link are always current.
 * 401 UNAUTHORIZED (from withHandler)
 */
module.exports.handler = middleware.withHandler(
    async ({ session, user }) =>
        http.ok({ user: await sessionUser(user), expiresAt: session.expiresAt }, { 'Cache-Control': 'no-store' }),
    { allowTemporaryPassword: true }
);
