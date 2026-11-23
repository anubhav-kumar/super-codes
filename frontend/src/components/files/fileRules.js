/**
 * Order file rules (FR2 decision 12, backend plan 3a.2): the same allow-list and 25 MB limit as the
 * backend, checked in the browser before any request so users get an immediate message. The
 * backend still validates and derives the stored content type from the extension.
 */

export const MAX_FILE_BYTES = 25 * 1024 * 1024;

// extension -> { contentType, kind (icon), label }
const TYPES = {
    pdf: { contentType: 'application/pdf', kind: 'file', label: 'PDF' },
    jpg: { contentType: 'image/jpeg', kind: 'file-image', label: 'Image' },
    jpeg: { contentType: 'image/jpeg', kind: 'file-image', label: 'Image' },
    png: { contentType: 'image/png', kind: 'file-image', label: 'Image' },
    heic: { contentType: 'image/heic', kind: 'file-image', label: 'Image' },
    webp: { contentType: 'image/webp', kind: 'file-image', label: 'Image' },
    doc: { contentType: 'application/msword', kind: 'file', label: 'Word' },
    docx: { contentType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', kind: 'file', label: 'Word' },
    xls: { contentType: 'application/vnd.ms-excel', kind: 'file-sheet', label: 'Excel' },
    xlsx: { contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', kind: 'file-sheet', label: 'Excel' },
    ppt: { contentType: 'application/vnd.ms-powerpoint', kind: 'file', label: 'PowerPoint' },
    pptx: { contentType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', kind: 'file', label: 'PowerPoint' },
    csv: { contentType: 'text/csv', kind: 'file-sheet', label: 'CSV' },
    zip: { contentType: 'application/zip', kind: 'file-archive', label: 'ZIP' },
};

const BY_CONTENT_TYPE = Object.values(TYPES).reduce((map, t) => {
    if (!map[t.contentType]) map[t.contentType] = t;
    return map;
}, {});

/** `accept` for the file input: extensions plus content types (some Android pickers use only one). */
export const ACCEPT = [...Object.keys(TYPES).map((ext) => `.${ext}`), ...Object.keys(BY_CONTENT_TYPE)].join(',');

const extensionOf = (name) => {
    const match = /\.([^./\\]+)$/.exec(String(name || '').trim());
    return match ? match[1].toLowerCase() : '';
};

const typeFor = (contentType, name) => TYPES[extensionOf(name)] || BY_CONTENT_TYPE[contentType] || null;

/**
 * checkFile(file) -> { ok, contentType, kind, error }. The content type always comes from the
 * extension, never from `file.type` (Android often reports HEIC and some Office files as empty).
 */
export function checkFile(file) {
    const type = TYPES[extensionOf(file && file.name)];
    const name = (file && file.name) || 'This file';
    if (!type) {
        return {
            ok: false,
            contentType: null,
            kind: 'file',
            error: `“${name}” can't be attached. Use PDF, images (JPG, PNG, HEIC, WEBP), Word, Excel, PowerPoint, CSV or ZIP.`,
        };
    }
    if (!file.size) return { ok: false, contentType: type.contentType, kind: type.kind, error: `“${name}” is empty.` };
    if (file.size > MAX_FILE_BYTES) {
        return { ok: false, contentType: type.contentType, kind: type.kind, error: `“${name}” is larger than 25 MB.` };
    }
    return { ok: true, contentType: type.contentType, kind: type.kind, error: null };
}

/** Icon name for a file row: file, file-image, file-sheet or file-archive. */
export function fileKind(contentType, name) {
    const type = typeFor(contentType, name);
    return type ? type.kind : 'file';
}

/** "PDF", "Image", "Word", "Excel", "PowerPoint", "CSV", "ZIP" ("File" when unknown). */
export function fileTypeLabel(contentType, name) {
    const type = typeFor(contentType, name);
    return type ? type.label : 'File';
}

/** "820 KB", "2.4 MB" (1 KB = 1,024 bytes). */
export function formatFileSize(bytes) {
    const n = Number(bytes);
    if (!Number.isFinite(n) || n < 0) return '';
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
    const mb = n / (1024 * 1024);
    return `${mb >= 10 ? Math.round(mb) : mb.toFixed(1)} MB`;
}
