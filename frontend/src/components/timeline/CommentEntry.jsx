import { useCallback, useEffect, useState } from 'react';
import Avatar from '../Avatar.jsx';
import ConfirmDialog from '../ConfirmDialog.jsx';
import Icon from '../Icon.jsx';
import Menu from '../Menu.jsx';
import RelativeTime from '../RelativeTime.jsx';
import CommentEditor from './CommentEditor.jsx';
import StatusBadge from './StatusBadge.jsx';
import { deleteOrderComment } from '../../api/orderTimeline.js';
import useOnlineStatus from '../../hooks/useOnlineStatus.js';
import useRole from '../../hooks/useRole.js';
import useSubmit from '../../hooks/useSubmit.js';
import useToast from '../../hooks/useToast.js';
import { formatDateTime } from '../../utils/format.js';

const firstName = (name) => String(name || '').trim().split(/\s+/)[0] || '';

/**
 * Who may do what on a comment (decision 9). The server's canEdit / canDelete win when present;
 * otherwise: the author edits and deletes, an admin deletes anyone's comment, a member nothing else.
 */
function permissions(entry, role) {
    const isAuthor = Boolean(role.user && entry.actor && entry.actor.id === role.user.id);
    return {
        isAuthor,
        canEdit: typeof entry.canEdit === 'boolean' ? entry.canEdit : isAuthor,
        canDelete: typeof entry.canDelete === 'boolean' ? entry.canDelete : isAuthor || role.isAdmin,
    };
}

/**
 * Comment block: avatar, author · relative time · "edited", an optional status line for a progress
 * update, then the text. `id="comment-<id>"` is the deep-link target (#comment-<id>); `highlight`
 * flashes the background after a deep link.
 *
 * F-61: a "more" menu top right. Own comment: Edit and Delete; an admin on another user's comment:
 * Delete only; members on others' comments: no menu. Both actions are online only. Edit happens in
 * place (CommentEditor); Delete asks first. `onChanged()` runs after a save or delete (the section
 * reloads the timeline, which keeps a deleted progress update's status changed event).
 */
export default function CommentEntry({ entry: listed, orderId, onChanged, highlight = false }) {
    const role = useRole();
    const { online } = useOnlineStatus();
    const toast = useToast();
    const { submit, submitting } = useSubmit();
    const [editing, setEditing] = useState(false);
    const [confirming, setConfirming] = useState(false);
    // The saved comment shows right away; the reloaded list takes over once it has the new text.
    const [saved, setSaved] = useState(null);
    const entry = saved && saved.id === listed.id && saved.text !== listed.text ? { ...listed, ...saved } : listed;
    useEffect(() => {
        if (saved && (saved.id !== listed.id || saved.text === listed.text)) setSaved(null);
    }, [saved, listed.id, listed.text]);

    const author = (entry.actor && entry.actor.name) || 'Unknown user';
    const change = entry.statusChange;
    const { isAuthor, canEdit, canDelete } = permissions(entry, role);
    const actionable = Boolean(orderId) && (canEdit || canDelete);

    const offlineHint = online ? undefined : 'Needs a connection';
    const items = actionable
        ? [
              canEdit && { label: 'Edit', icon: 'edit', disabled: !online, hint: offlineHint, onSelect: () => setEditing(true) },
              canDelete && {
                  label: 'Delete',
                  icon: 'delete',
                  tone: 'danger',
                  disabled: !online,
                  hint: offlineHint,
                  onSelect: () => setConfirming(true),
              },
          ]
        : [];

    const cancelDelete = useCallback(() => setConfirming(false), []);

    async function runDelete() {
        const result = await submit(() => deleteOrderComment(orderId, entry.id));
        setConfirming(false);
        if (result.ok) {
            toast.success('Comment deleted');
            if (onChanged) onChanged();
            return;
        }
        const error = result.error;
        if (!error || error.offline) {
            toast.error('No connection. The comment was not deleted.');
            return;
        }
        toast.error(error.message || "Couldn't delete the comment");
        if (error.status === 404 && onChanged) onChanged();
    }

    function onSaved(comment) {
        if (comment && comment.text) setSaved({ id: listed.id, text: comment.text, editedAt: comment.editedAt || listed.editedAt });
        setEditing(false);
        if (onChanged) onChanged();
    }

    function onGone() {
        setEditing(false);
        toast.error('This comment was deleted.');
        if (onChanged) onChanged();
    }

    const deleteTitle = isAuthor ? 'Delete this comment?' : `Delete ${firstName(author) || 'this user'}'s comment?`;
    const deleteText = `It's removed for everyone. This can't be undone.${change ? ' The order status stays as it is.' : ''}`;

    return (
        <article
            id={`comment-${entry.id}`}
            className={`-mx-2 flex scroll-mt-4 items-start gap-3 rounded-lg px-2 py-1 transition-colors duration-500 ${highlight ? 'bg-surface-muted' : ''}`}
        >
            <Avatar name={author} />
            <div className="min-w-0 flex-1">
                <div className="flex items-start gap-2">
                    <p className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-1.5 text-sm text-ink-muted">
                        <span className="font-medium text-ink">{author}</span>
                        <span aria-hidden="true">·</span>
                        <RelativeTime value={entry.createdAt} />
                        {entry.editedAt && (
                            <>
                                <span aria-hidden="true">·</span>
                                <span
                                    title={`Edited ${formatDateTime(entry.editedAt)}`}
                                    tabIndex={0}
                                    className="rounded outline-none focus-visible:outline-2 focus-visible:outline-accent"
                                >
                                    edited
                                    <span className="sr-only"> {formatDateTime(entry.editedAt)}</span>
                                </span>
                            </>
                        )}
                    </p>
                    {actionable && !editing && (
                        <Menu
                            label="Comment actions"
                            icon="more"
                            sheetOnPhone
                            sheetTitle="Comment"
                            items={items}
                            className="-my-2.5 -mr-2 md:-my-1.5"
                            triggerClassName="inline-flex h-11 w-11 items-center justify-center rounded-control text-ink-muted transition hover:bg-surface-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent md:h-8 md:w-8"
                        />
                    )}
                </div>
                {change && (
                    <p className="mt-1 flex flex-wrap items-center gap-1.5 text-sm text-ink-muted">
                        Changed status
                        <StatusBadge status={change.from} />
                        <Icon name="arrow-right" size="sm" className="text-ink-subtle" />
                        <span className="sr-only">to</span>
                        <StatusBadge status={change.to} />
                    </p>
                )}
                {editing ? (
                    <CommentEditor orderId={orderId} entry={entry} onSaved={onSaved} onGone={onGone} onCancel={() => setEditing(false)} />
                ) : (
                    <p className="mt-1 text-[15px]/[22px] break-words whitespace-pre-line text-ink md:text-sm/6">{entry.text}</p>
                )}
            </div>
            {canDelete && (
                <ConfirmDialog
                    open={confirming}
                    title={deleteTitle}
                    text={deleteText}
                    confirmLabel="Delete comment"
                    tone="danger"
                    busy={submitting}
                    onConfirm={runDelete}
                    onCancel={cancelDelete}
                />
            )}
        </article>
    );
}
