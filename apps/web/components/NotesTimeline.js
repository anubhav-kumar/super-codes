'use client';

import { CircleAlert, Pencil, ShieldCheck, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, errorText } from '../lib/client-api.js';
import { NOTE_BODY_MAX, NOTE_EDIT_WINDOW_MS } from '../lib/constants.js';
import { formatFull } from '../lib/format.js';
import { formatRelative } from '../lib/relative-time.js';
import { findSensitive, sensitiveWarning } from '../lib/sensitive.js';
import { usePolling } from '../lib/use-polling.js';
import { useToast } from './Toast.js';
import { useUser } from './UserContext.js';

const POLL_MS = 15000;
const PAGE_SIZE = 20;
const COUNTER_FROM = NOTE_BODY_MAX - 300;

const GUIDANCE =
  "Internal only. Never visible to the client. Record only what's needed to help them. Don't paste passport, card or ID numbers.";

// Newest-first pages → one newest-first list without duplicates.
function mergeNotes(latest, older) {
  const seen = new Set();
  const merged = [];
  for (const note of [...latest, ...older]) {
    if (!seen.has(note.noteId)) {
      seen.add(note.noteId);
      merged.push(note);
    }
  }
  return merged;
}

function canEdit(note, user) {
  return (
    !note.deleted &&
    note.author?.userId === user.userId &&
    Date.now() - Date.parse(note.createdAt) < NOTE_EDIT_WINDOW_MS
  );
}

function canDelete(note, user) {
  return !note.deleted && (user.role === 'admin' || note.author?.userId === user.userId);
}

function NoteEditor({ initial = '', busy, submitLabel, onSubmit, onCancel, autoFocus }) {
  const [text, setText] = useState(initial);
  const warning = sensitiveWarning(findSensitive(text));
  const trimmed = text.trim();

  const submit = async () => {
    if (!trimmed || busy) return;
    const ok = await onSubmit(trimmed);
    if (ok && !onCancel) setText('');
  };

  return (
    <form
      className="note-editor"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <textarea
        className="input note-input"
        rows={3}
        placeholder="Add an internal note"
        aria-label={onCancel ? 'Edit note' : 'New note'}
        maxLength={NOTE_BODY_MAX}
        value={text}
        disabled={busy}
        autoFocus={autoFocus}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            submit();
          } else if (event.key === 'Escape' && onCancel) {
            event.stopPropagation();
            onCancel();
          }
        }}
      />
      {warning && (
        <p className="alert warn small" role="status">
          <CircleAlert size={14} aria-hidden="true" />
          {warning}
        </p>
      )}
      <div className="note-editor-actions">
        {text.length >= COUNTER_FROM && (
          <span className="muted small">
            {text.length}/{NOTE_BODY_MAX}
          </span>
        )}
        <span className="muted small note-shortcut">Ctrl/⌘ + Enter</span>
        {onCancel && (
          <button type="button" className="button ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
        )}
        <button type="submit" className="button primary" disabled={!trimmed || busy}>
          {submitLabel}
        </button>
      </div>
    </form>
  );
}

function NoteItem({ note, user, busy, editing, onEdit, onCancelEdit, onSave, onDelete }) {
  if (note.deleted) {
    return (
      <li className="note deleted">
        Note deleted by {note.deletedBy?.name ?? 'someone'}, {formatFull(note.deletedAt)}
      </li>
    );
  }

  return (
    <li className="note">
      <div className="note-meta">
        <span className="note-author">
          {note.author?.userId === user.userId ? 'You' : (note.author?.name ?? 'Unknown')}
        </span>
        {note.authorRole === 'admin' && (
          <span className="badge accent">
            <ShieldCheck size={11} aria-hidden="true" />
            <span>Admin</span>
          </span>
        )}
        <time dateTime={note.createdAt} title={formatFull(note.createdAt)} className="muted small">
          {formatRelative(note.createdAt)}
        </time>
        {note.editedAt && (
          <span className="muted small" title={`Edited ${formatFull(note.editedAt)}`}>
            · edited
          </span>
        )}
        <span className="note-actions">
          {canEdit(note, user) && !editing && (
            <button
              type="button"
              className="icon-button sm"
              aria-label="Edit note"
              title="Edit (within 15 minutes)"
              disabled={busy}
              onClick={onEdit}
            >
              <Pencil size={14} aria-hidden="true" />
            </button>
          )}
          {canDelete(note, user) && !editing && (
            <button
              type="button"
              className="icon-button sm"
              aria-label="Delete note"
              title="Delete note"
              disabled={busy}
              onClick={onDelete}
            >
              <Trash2 size={14} aria-hidden="true" />
            </button>
          )}
        </span>
      </div>
      {editing ? (
        <NoteEditor
          initial={note.body}
          busy={busy}
          submitLabel="Save"
          autoFocus
          onSubmit={onSave}
          onCancel={onCancelEdit}
        />
      ) : (
        <p className="note-body">{note.body}</p>
      )}
    </li>
  );
}

// F4: internal notes, newest first. Loaded when the panel opens and re-read every 15 s while
// it is open and the tab is visible (usePolling). Plain text only (React escapes it).
export function NotesTimeline({ id }) {
  const user = useUser();
  const toast = useToast();
  const [latest, setLatest] = useState(null);
  const [latestNextBefore, setLatestNextBefore] = useState(null);
  const [older, setOlder] = useState([]);
  const [olderNextBefore, setOlderNextBefore] = useState(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const chatRef = useRef(id); // the chat currently shown

  useEffect(() => {
    chatRef.current = id;
    setLatest(null);
    setOlder([]);
    setOlderNextBefore(null);
    setEditingId(null);
    setError(null);
  }, [id]);

  const refresh = useCallback(async () => {
    try {
      const data = await api.listNotes(id, { limit: PAGE_SIZE });
      if (chatRef.current !== id) return;
      setLatest(data.notes);
      setLatestNextBefore(data.nextBefore);
      setError(null);
    } catch (err) {
      if (err.status !== 401) setError(errorText(err));
    }
  }, [id]);

  usePolling(refresh, POLL_MS, [id]);

  const notes = useMemo(() => mergeNotes(latest ?? [], older), [latest, older]);
  const hasOlder = older.length ? olderNextBefore !== null : latestNextBefore !== null;

  const run = async (action, failText) => {
    setBusy(true);
    try {
      await action();
      return true;
    } catch (err) {
      if (err.status !== 401) toast.error(`${failText}: ${errorText(err)}`);
      return false;
    } finally {
      setBusy(false);
      refresh();
    }
  };

  const add = (body) =>
    run(async () => {
      const { note } = await api.createNote(id, body);
      setLatest((prev) => [note, ...(prev ?? [])]);
    }, 'Could not save note');

  const save = (noteId) => (body) =>
    run(async () => {
      const { note } = await api.editNote(id, noteId, body);
      const replace = (list) => list.map((n) => (n.noteId === noteId ? note : n));
      setLatest((prev) => replace(prev ?? []));
      setOlder(replace);
      setEditingId(null);
    }, 'Could not edit note');

  const remove = (noteId) => {
    if (!window.confirm('Delete this note? Its text is removed for everyone.')) return;
    run(() => api.deleteNote(id, noteId), 'Could not delete note');
  };

  const loadOlder = async () => {
    const oldest = notes.at(-1);
    if (!oldest || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const data = await api.listNotes(id, { before: oldest.noteId, limit: PAGE_SIZE });
      setOlder((prev) => [...prev, ...data.notes]);
      setOlderNextBefore(data.nextBefore);
    } catch (err) {
      if (err.status !== 401) toast.error(`Could not load older notes: ${errorText(err)}`);
    } finally {
      setLoadingOlder(false);
    }
  };

  return (
    <div className="notes">
      <NoteEditor busy={busy} submitLabel="Add note" onSubmit={add} />
      <p className="field-hint">{GUIDANCE}</p>

      {error && (
        <p className="alert danger small" role="alert">
          {error}
        </p>
      )}
      {latest === null && !error && <p className="muted small">Loading notes…</p>}
      {latest !== null && notes.length === 0 && <p className="muted small">No notes yet.</p>}

      <ul className="note-list" aria-label="Notes">
        {notes.map((note) => (
          <NoteItem
            key={note.noteId}
            note={note}
            user={user}
            busy={busy}
            editing={editingId === note.noteId}
            onEdit={() => setEditingId(note.noteId)}
            onCancelEdit={() => setEditingId(null)}
            onSave={save(note.noteId)}
            onDelete={() => remove(note.noteId)}
          />
        ))}
      </ul>

      {hasOlder && (
        <button type="button" className="button ghost" onClick={loadOlder} disabled={loadingOlder}>
          {loadingOlder ? 'Loading…' : 'Load older notes'}
        </button>
      )}
    </div>
  );
}
