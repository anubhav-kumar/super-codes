import { useCallback, useEffect, useRef, useState } from 'react';
import { completeOrderFileUpload, removeOrderFile, startOrderFileUpload } from '../../api/orderFiles.js';
import useOnlineStatus from '../../hooks/useOnlineStatus.js';
import { useOrderFiles } from '../../hooks/useOrderFiles.js';
import useRole from '../../hooks/useRole.js';
import useToast from '../../hooks/useToast.js';
import Button from '../Button.jsx';
import ConfirmDialog from '../ConfirmDialog.jsx';
import DataView from '../DataView.jsx';
import FileRow from '../files/FileRow.jsx';
import { ACCEPT, checkFile } from '../files/fileRules.js';
import UploadRow from '../files/UploadRow.jsx';
import useFileUploads from '../files/useFileUploads.js';
import useOpenFile from '../files/useOpenFile.js';
import Menu from '../Menu.jsx';
import StaleDataNotice from '../offline/StaleDataNotice.jsx';
import Section from '../Section.jsx';
import SectionAction from '../SectionAction.jsx';

const SHOWN = 10;
const OFFLINE_TEXT = 'Connect to the internet to upload';
const NEEDS_CONNECTION = 'Needs a connection';

/**
 * Files section of order detail (F-62): private files attached to the order, newest first, and
 * uploads in progress. Upload = request an upload slot -> PUT the bytes with exactly the returned
 * headers -> complete; only then is it a file row. Uploads are online only and stop when the page
 * is left. The list (names, never links) is readable offline from the API cache. Tapping a file
 * opens it through a fresh short-lived link (F-63, online only). The row menu holds Open and, for
 * the uploader or an admin, Remove (F-64: confirm, online only, then the list reloads).
 */
export default function OrderFilesSection({ order, className = '' }) {
    const orderId = order.id;
    const { online } = useOnlineStatus();
    const toast = useToast();
    const { user, isAdmin } = useRole();
    const files = useOrderFiles(orderId);
    const reloadFiles = files.reload;
    const inputRef = useRef(null);
    const [showAll, setShowAll] = useState(false);
    // F-64: the file awaiting confirmation, the removal in flight, and ids removed in this session
    // (hidden at once, also from just-finished uploads, while the list reloads).
    const [confirmRemove, setConfirmRemove] = useState(null);
    const [removing, setRemoving] = useState(false);
    const [removedIds, setRemovedIds] = useState(() => new Set());

    // Reload when the order's activity changes (another user's upload shows after the order
    // reloads); skip the first render, the list has just loaded.
    const activity = order.latestActivityAt || null;
    const lastActivity = useRef(activity);
    useEffect(() => {
        if (lastActivity.current === activity) return;
        lastActivity.current = activity;
        reloadFiles();
    }, [activity, reloadFiles]);

    const requestSlot = useCallback(
        async ({ fileId, name, size }, { signal }) => {
            const res = await startOrderFileUpload(orderId, { id: fileId, fileName: name, size }, { signal });
            const data = res.data || {};
            return { uploadUrl: data.uploadUrl || null, uploadHeaders: data.uploadHeaders || {} };
        },
        [orderId],
    );
    const complete = useCallback(
        async ({ fileId }, { signal }) => {
            const res = await completeOrderFileUpload(orderId, fileId, { signal });
            return (res.data && res.data.file) || null;
        },
        [orderId],
    );
    const uploads = useFileUploads({ requestSlot, complete, onUploaded: reloadFiles });
    // F-63: each tap fetches a fresh short-lived link; a 404 means removed or no longer visible.
    const opener = useOpenFile(orderId, { onGone: reloadFiles });

    // Compare login user ids, not Worker ids (FR2 A1); the backend enforces the same rule.
    const canRemove = (file) => isAdmin || Boolean(user && file.uploadedBy && file.uploadedBy.id === user.id);

    const cancelRemove = useCallback(() => {
        if (!removing) setConfirmRemove(null);
    }, [removing]);

    const remove = async () => {
        const target = confirmRemove;
        if (!target || removing) return;
        setRemoving(true);
        try {
            await removeOrderFile(orderId, target.id);
            removed(target);
        } catch (error) {
            if (error && error.status === 404) {
                // Already gone (removed by someone else, or a retry after a dropped connection).
                removed(target);
            } else if (error && error.offline) {
                toast.error('Removing files needs a connection.');
            } else {
                toast.error((error && error.message) || "Couldn't remove the file. Try again.");
            }
        } finally {
            setRemoving(false);
        }
    };

    function removed(file) {
        setRemovedIds((prev) => new Set(prev).add(file.id));
        setConfirmRemove(null);
        toast.success('File removed');
        reloadFiles();
    }

    const choose = () => {
        if (online && inputRef.current) inputRef.current.click();
    };

    const onChosen = (e) => {
        const chosen = Array.from(e.target.files || []);
        // Reset so the same file can be chosen again (e.g. after a discard).
        e.target.value = '';
        const accepted = [];
        chosen.forEach((file) => {
            const check = checkFile(file);
            if (check.ok) accepted.push(file);
            else toast.error(check.error);
        });
        uploads.add(accepted);
    };

    const pending = uploads.items.filter((it) => it.status !== 'done');
    const uploading = pending.some((it) => it.status === 'uploading' || it.status === 'queued');
    const loaded = files.status === 'loaded';
    const listed = loaded ? files.data || [] : [];
    // Just-finished uploads show as file rows until the reloaded list contains them.
    const listedIds = new Set(listed.map((f) => f.id));
    const finished = uploads.items
        .filter((it) => it.status === 'done' && it.result && !listedIds.has(it.result.id))
        .map((it) => it.result);
    const all = [...finished, ...listed].filter((f) => !removedIds.has(f.id));
    const shown = showAll ? all : all.slice(0, SHOWN);

    const attachButton = (
        <SectionAction icon="attach" onClick={choose} disabled={!online} title={online ? undefined : OFFLINE_TEXT}>
            Attach files
        </SectionAction>
    );

    return (
        <Section
            id="files"
            title="Files"
            count={loaded && all.length ? all.length : ''}
            action={attachButton}
            className={className}
            footer={
                loaded && !showAll && all.length > SHOWN ? (
                    <button
                        type="button"
                        onClick={() => setShowAll(true)}
                        className="flex min-h-12 w-full items-center justify-center text-sm font-medium text-ink hover:bg-surface-subtle focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
                    >
                        Show all ({all.length})
                    </button>
                ) : undefined
            }
        >
            <input ref={inputRef} type="file" multiple accept={ACCEPT} onChange={onChosen} className="hidden" tabIndex={-1} aria-hidden="true" />
            {!online && <p className="px-4 pb-3 text-sm text-ink-muted">{OFFLINE_TEXT}.</p>}
            {uploading && <p className="px-4 pb-3 text-sm text-ink-muted">Keep this screen open until uploads finish.</p>}
            {loaded && files.fromCache && <StaleDataNotice fetchedAt={files.fetchedAt} className="mx-4 mb-3" />}
            {(pending.length > 0 || shown.length > 0) && (
                <ul className="divide-y divide-line border-t border-line">
                    {pending.map((it) => (
                        <li key={it.id}>
                            <UploadRow
                                item={it}
                                online={online}
                                onCancel={() => uploads.cancel(it.id)}
                                onRetry={() => uploads.retry(it.id)}
                                onDiscard={() => uploads.discard(it.id)}
                            />
                        </li>
                    ))}
                    {shown.map((file) => (
                        <li key={file.id}>
                            <FileRow
                                file={file}
                                onOpen={() => opener.open(file)}
                                opening={opener.openingId === file.id}
                                online={online}
                                trailing={
                                    <Menu
                                        label={`Actions for ${file.fileName || 'file'}`}
                                        icon="more"
                                        sheetOnPhone
                                        sheetTitle={file.fileName || 'File'}
                                        items={[
                                            {
                                                label: 'Open',
                                                icon: 'file',
                                                disabled: !online || opener.openingId === file.id,
                                                hint: online ? undefined : NEEDS_CONNECTION,
                                                onSelect: () => opener.open(file),
                                            },
                                            canRemove(file) && {
                                                label: 'Remove',
                                                icon: 'remove-file',
                                                tone: 'danger',
                                                disabled: !online || removing,
                                                hint: online ? undefined : NEEDS_CONNECTION,
                                                onSelect: () => setConfirmRemove(file),
                                            },
                                        ]}
                                    />
                                }
                            />
                        </li>
                    ))}
                </ul>
            )}
            {!loaded ? (
                <div className="px-4 pb-4">
                    <DataView resource={files} compact />
                </div>
            ) : (
                all.length === 0 &&
                pending.length === 0 && (
                    <div className="flex flex-col items-start gap-3 px-4 pb-4">
                        <p className="text-sm text-ink-muted">No files yet.</p>
                        {online && (
                            <Button variant="secondary" icon="attach" onClick={choose}>
                                Attach files
                            </Button>
                        )}
                    </div>
                )
            )}
            {opener.sheet}
            <ConfirmDialog
                open={Boolean(confirmRemove)}
                title={confirmRemove ? `Remove “${confirmRemove.fileName || 'this file'}”?` : ''}
                text="Nobody on this order can open it after this."
                confirmLabel="Remove file"
                tone="danger"
                busy={removing}
                onConfirm={remove}
                onCancel={cancelRemove}
            />
        </Section>
    );
}
