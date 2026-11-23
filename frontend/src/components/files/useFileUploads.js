import { useCallback, useEffect, useRef, useState } from 'react';
import { uploadFile } from '../../api/client.js';
import { checkFile } from './fileRules.js';

const MAX_PARALLEL = 3;

// Codes after which the same server file id cannot be reused: the next attempt starts a new one.
const NEW_ID_CODES = new Set(['ID_CONFLICT', 'UPLOAD_INCOMPLETE']);

const isAbort = (err) => err && err.name === 'AbortError';

function failureMessage(err) {
    if (err && err.offline) return 'Upload failed. Check your connection.';
    // API errors carry a code and a user-facing message; storage (PUT) errors do not.
    if (err && err.code) {
        const detail = Array.isArray(err.details) && err.details.find((d) => d && d.message);
        return (detail && detail.message) || err.message || 'Upload failed';
    }
    return 'Upload failed';
}

/**
 * Upload queue for private files (frontend-architecture.md 15.1). Used by the Files section (P-28)
 * and, later, the comment composer (P-30).
 *
 *   const uploads = useFileUploads({ requestSlot, complete, onUploaded });
 *   uploads.add(files)  uploads.retry(id)  uploads.cancel(id)  uploads.discard(id)  uploads.items
 *
 *   requestSlot({ fileId, name, size, contentType }, { signal })
 *       -> { uploadUrl, uploadHeaders } (uploadUrl null: the file is already stored, skip the PUT)
 *   complete({ fileId, ... }, { signal }) -> result   optional; runs after a 2xx PUT (register the file)
 *   onUploaded(item)                                   optional; after success, item.result = complete's result
 *
 * items: { id, fileId, name, size, contentType, kind, status: 'queued' | 'uploading' | 'failed' | 'done',
 *          progress (0..1), error, result }. Files must pass checkFile (callers check first and
 * toast the rejections; add() skips any that do not pass). At most 3 run at a time; everything
 * is aborted on unmount (no background uploads). Upload links live only inside one attempt:
 * never in state, never logged. Every attempt, including a retry, asks for a fresh link.
 */
export default function useFileUploads({ requestSlot, complete, onUploaded }) {
    const [items, setItems] = useState([]);
    const files = useRef(new Map()); // item id -> File (bytes stay out of render state)
    const controllers = useRef(new Map()); // item id -> AbortController of the running attempt
    const callbacks = useRef({ requestSlot, complete, onUploaded });
    callbacks.current = { requestSlot, complete, onUploaded };
    const mounted = useRef(true);

    const patch = useCallback((id, changes) => {
        if (!mounted.current) return;
        setItems((list) => list.map((it) => (it.id === id ? { ...it, ...changes } : it)));
    }, []);

    const run = useCallback(
        async (item) => {
            const controller = new AbortController();
            controllers.current.set(item.id, controller);
            const { signal } = controller;
            const meta = { fileId: item.fileId, name: item.name, size: item.size, contentType: item.contentType };
            try {
                const slot = await callbacks.current.requestSlot(meta, { signal });
                if (slot && slot.uploadUrl) {
                    try {
                        await uploadFile(slot.uploadUrl, slot.uploadHeaders, files.current.get(item.id), {
                            signal,
                            onProgress: (p) => patch(item.id, { progress: p }),
                        });
                    } catch (err) {
                        // 412: an object already exists under this file's key (an earlier attempt of
                        // this same file got through), so finishing checks it. Anything else fails.
                        if (!(err && err.status === 412)) throw err;
                    }
                }
                const result = callbacks.current.complete ? await callbacks.current.complete(meta, { signal }) : null;
                if (signal.aborted) return;
                files.current.delete(item.id);
                const done = { ...item, status: 'done', progress: 1, error: null, result };
                patch(item.id, { status: 'done', progress: 1, error: null, result });
                if (callbacks.current.onUploaded) callbacks.current.onUploaded(done);
            } catch (err) {
                if (signal.aborted || isAbort(err)) return;
                patch(item.id, {
                    status: 'failed',
                    error: failureMessage(err),
                    ...(err && NEW_ID_CODES.has(err.code) ? { fileId: crypto.randomUUID() } : {}),
                });
            } finally {
                if (controllers.current.get(item.id) === controller) controllers.current.delete(item.id);
            }
        },
        [patch],
    );

    // Start queued items while fewer than MAX_PARALLEL run.
    useEffect(() => {
        const running = items.filter((it) => it.status === 'uploading').length;
        const next = items.filter((it) => it.status === 'queued').slice(0, Math.max(0, MAX_PARALLEL - running));
        if (next.length === 0) return;
        const ids = new Set(next.map((it) => it.id));
        setItems((list) => list.map((it) => (ids.has(it.id) ? { ...it, status: 'uploading', progress: 0, error: null } : it)));
        next.forEach((it) => run(it));
    }, [items, run]);

    useEffect(() => {
        mounted.current = true;
        const running = controllers.current;
        return () => {
            mounted.current = false;
            running.forEach((c) => c.abort());
            running.clear();
            files.current.clear();
        };
    }, []);

    const add = useCallback((list) => {
        const added = [];
        Array.from(list || []).forEach((file) => {
            const check = checkFile(file);
            if (!check.ok) return;
            const id = crypto.randomUUID();
            files.current.set(id, file);
            added.push({
                id,
                fileId: crypto.randomUUID(),
                name: file.name,
                size: file.size,
                contentType: check.contentType,
                kind: check.kind,
                status: 'queued',
                progress: 0,
                error: null,
                result: null,
            });
        });
        // Newest first, like the file list.
        if (added.length) setItems((current) => [...added.reverse(), ...current]);
    }, []);

    const retry = useCallback((id) => {
        setItems((list) => list.map((it) => (it.id === id && it.status === 'failed' ? { ...it, status: 'queued', progress: 0, error: null } : it)));
    }, []);

    const drop = useCallback((id) => {
        const controller = controllers.current.get(id);
        if (controller) controller.abort();
        controllers.current.delete(id);
        files.current.delete(id);
        setItems((list) => list.filter((it) => it.id !== id));
    }, []);

    return { items, add, retry, cancel: drop, discard: drop };
}
