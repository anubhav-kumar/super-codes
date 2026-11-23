'use strict';

const { errors, validators } = require('common');
const { MAX_FILE_BYTES, contentTypeFor } = require('../utils/fileTypes');

// Control characters, and path separators that would make the name look like a path.
const FORBIDDEN_NAME_CHARS = /[\u0000-\u001f\u007f/\\]/;

/**
 * Body of POST /files/orders/{orderId}/uploads: { id, fileName, size }.
 * Returns { id, fileName, contentType, size } or throws VALIDATION_FAILED with field details.
 */
function parseUpload(body) {
    const input = body && typeof body === 'object' && !Array.isArray(body) ? body : {};
    const details = [];

    const id = input.id;
    if (!validators.isUuidV4(id)) details.push({ field: 'id', message: 'id must be a UUID v4' });

    let fileName = null;
    let contentType = null;
    if (input.fileName !== undefined && input.fileName !== null && typeof input.fileName !== 'string') {
        details.push({ field: 'fileName', message: 'File name must be text' });
    } else {
        fileName = typeof input.fileName === 'string' ? input.fileName.trim() : '';
        if (fileName === '') details.push({ field: 'fileName', message: 'File name is required' });
        else if (fileName.length > 200) details.push({ field: 'fileName', message: 'File name must be at most 200 characters' });
        else if (FORBIDDEN_NAME_CHARS.test(fileName)) details.push({ field: 'fileName', message: 'File name contains characters that are not allowed' });
        else {
            contentType = contentTypeFor(fileName);
            if (!contentType) details.push({ field: 'fileName', message: 'This file type is not allowed' });
        }
    }

    const size = input.size;
    if (typeof size !== 'number' || !Number.isInteger(size)) details.push({ field: 'size', message: 'size must be a whole number of bytes' });
    else if (size < 1) details.push({ field: 'size', message: 'The file is empty' });
    else if (size > MAX_FILE_BYTES) details.push({ field: 'size', message: 'Files can be at most 25 MB' });

    if (details.length) throw errors.validationFailed(details);
    return { id, fileName, contentType, size };
}

module.exports = { parseUpload };
