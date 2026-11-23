import { createElement, useCallback, useEffect, useRef, useState } from 'react';
import { getOrderFileLink } from '../../api/orderFiles.js';
import useOnlineStatus from '../../hooks/useOnlineStatus.js';
import useToast from '../../hooks/useToast.js';
import FileReadySheet from './FileReadySheet.jsx';

const OFFLINE_TEXT = 'Opening files needs a connection.';

/**
 * Opens a private order file (F-63). Every call fetches a fresh short-lived link and uses it once.
 *   const opener = useOpenFile(orderId, { onGone: files.reload });
 *   <FileRow onOpen={() => opener.open(file)} opening={opener.openingId === file.id} />
 *   {opener.sheet}
 * `open(file)` must be called from the tap handler: it opens a blank tab before any await, so the
 * browser treats it as a user-initiated pop-up, then points that tab at the link. When the pop-up
 * was blocked, `sheet` shows a "File ready" sheet with the link; closing it drops the link.
 * The link is never kept anywhere else (no resource cache, router state, toast or console).
 * `onGone` runs on 404 (file removed, or the user lost access to the order).
 */
export default function useOpenFile(orderId, { onGone } = {}) {
    const { online } = useOnlineStatus();
    const toast = useToast();
    const [openingId, setOpeningId] = useState(null);
    const [ready, setReady] = useState(null); // { fileName, url, expiresAt } only while the fallback sheet is open
    const busy = useRef(false);
    const mounted = useRef(true);
    const goneRef = useRef(onGone);
    goneRef.current = onGone;

    useEffect(() => {
        mounted.current = true;
        return () => {
            mounted.current = false;
        };
    }, []);

    // The link stops working after it expires: drop it with the sheet.
    useEffect(() => {
        if (!ready) return undefined;
        const ms = Date.parse(ready.expiresAt) - Date.now();
        if (!Number.isFinite(ms)) return undefined;
        const timer = setTimeout(() => setReady(null), Math.max(ms, 0));
        return () => clearTimeout(timer);
    }, [ready]);

    const open = useCallback(
        async (file) => {
            if (!file || busy.current) return;
            if (!online) {
                toast.error(OFFLINE_TEXT);
                return;
            }
            // Before any await, so the pop-up keeps the user gesture.
            let tab = null;
            try {
                tab = window.open('', '_blank');
            } catch {
                tab = null;
            }
            if (tab) {
                try {
                    tab.opener = null;
                    tab.document.title = file.fileName || 'File';
                    tab.document.body.textContent = 'Opening file…';
                } catch {
                    // Not fatal: the tab is still pointed at the link below.
                }
            }
            busy.current = true;
            setOpeningId(file.id);
            try {
                const res = await getOrderFileLink(orderId, file.id);
                const data = res.data || {};
                if (!data.url) throw new Error('No link');
                if (tab && !tab.closed) {
                    tab.location.replace(data.url);
                } else if (mounted.current) {
                    setReady({ fileName: file.fileName || 'File', url: data.url, expiresAt: data.expiresAt || null });
                }
            } catch (err) {
                if (tab && !tab.closed) tab.close();
                if (err && err.offline) {
                    toast.error(OFFLINE_TEXT);
                } else if (err && err.status === 404) {
                    toast.error('This file is no longer available.');
                    if (goneRef.current) goneRef.current();
                } else if (!(err && err.status === 401)) {
                    toast.error("Couldn't open the file. Try again.");
                }
            } finally {
                busy.current = false;
                if (mounted.current) setOpeningId(null);
            }
        },
        [orderId, online, toast],
    );

    const close = useCallback(() => setReady(null), []);
    const sheet = ready ? createElement(FileReadySheet, { fileName: ready.fileName, url: ready.url, onClose: close }) : null;

    return { open, openingId, sheet };
}
