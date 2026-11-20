'use strict';

const { logger, http } = require('common');

/**
 * GET /health?clientTs=<ISO timestamp>
 * 200 { status, serverTimestamp, clientTimestamp }  (clientTimestamp is null when clientTs is missing)
 * 400 when clientTs is present but not a valid timestamp.
 */
module.exports.handler = async (event) => {
    try {
        const params = (event && event.queryStringParameters) || {};
        const clientTs = Object.prototype.hasOwnProperty.call(params, 'clientTs') ? params.clientTs : undefined;

        if (clientTs !== undefined && (clientTs === null || clientTs === '' || Number.isNaN(Date.parse(clientTs)))) {
            return http.badRequest('clientTs must be a valid ISO 8601 timestamp');
        }

        return http.ok(
            {
                status: 'ok',
                serverTimestamp: new Date().toISOString(),
                clientTimestamp: clientTs === undefined ? null : clientTs,
            },
            { 'Cache-Control': 'no-store' }
        );
    } catch (err) {
        logger.error('health check failed', { error: err.message });
        return http.serverError();
    }
};
