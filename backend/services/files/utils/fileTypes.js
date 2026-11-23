'use strict';

/**
 * Allowed order-file types (FR2 backend plan section 3a.2). The server derives the stored
 * contentType from the file name's extension (case-insensitive) and ignores any client value.
 * Anything else (HTML, SVG, JS, executables, ...) is refused.
 */

const MAX_FILE_BYTES = 26214400; // 25 MB

const CONTENT_TYPES = Object.freeze({
    pdf: 'application/pdf',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    heic: 'image/heic',
    webp: 'image/webp',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ppt: 'application/vnd.ms-powerpoint',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    csv: 'text/csv',
    zip: 'application/zip',
});

/** Canonical content type for a file name, or null when its extension is not allowed. */
function contentTypeFor(fileName) {
    const dot = fileName.lastIndexOf('.');
    if (dot <= 0 || dot === fileName.length - 1) return null;
    const ext = fileName.slice(dot + 1).toLowerCase();
    return Object.prototype.hasOwnProperty.call(CONTENT_TYPES, ext) ? CONTENT_TYPES[ext] : null;
}

module.exports = { MAX_FILE_BYTES, CONTENT_TYPES, contentTypeFor };
