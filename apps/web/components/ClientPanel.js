'use client';

import { CircleAlert, Pencil } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { api, errorText } from '../lib/client-api.js';
import { DESCRIPTION_MAX } from '../lib/constants.js';
import { formatFull } from '../lib/format.js';
import { rememberTags, useKnownTags } from '../lib/known-tags.js';
import { formatRelative } from '../lib/relative-time.js';
import { findSensitive, sensitiveWarning } from '../lib/sensitive.js';
import { NotesTimeline } from './NotesTimeline.js';
import { TagInput } from './TagInput.js';
import { useToast } from './Toast.js';
import { useUser } from './UserContext.js';

const COUNTER_FROM = DESCRIPTION_MAX - 200;

function editorName(ref, user) {
  if (!ref) return null;
  return ref.userId === user.userId ? 'you' : ref.name;
}

// Inline description editor with optimistic locking: the save sends the profileVersion it
// was opened with; a 409 CONFLICT shows the other editor's text with overwrite / discard.
function Description({ chat, onChanged }) {
  const user = useUser();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [baseVersion, setBaseVersion] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [conflict, setConflict] = useState(null);

  const description = chat.description ?? '';
  const warning = editing ? sensitiveWarning(findSensitive(draft)) : null;

  const open = () => {
    setDraft(description);
    setBaseVersion(chat.profileVersion ?? 0);
    setConflict(null);
    setError(null);
    setEditing(true);
  };

  const close = () => {
    setEditing(false);
    setConflict(null);
    setError(null);
  };

  const save = async (version) => {
    setBusy(true);
    setError(null);
    try {
      await api.updateDescription(chat.id, draft.trim(), version);
      close();
      onChanged?.();
    } catch (err) {
      if (err.code === 'CONFLICT' && err.details?.current) {
        setConflict(err.details.current);
      } else if (err.status !== 401) {
        setError(errorText(err));
      }
    } finally {
      setBusy(false);
    }
  };

  const discardMine = () => {
    close();
    onChanged?.();
  };

  if (!editing) {
    return (
      <div className="client-description">
        {description ? (
          <p className="client-description-text">{description}</p>
        ) : (
          <p className="muted small">No description yet.</p>
        )}
        <div className="client-description-meta">
          {chat.descriptionUpdatedAt && (
            <span className="muted small" title={formatFull(chat.descriptionUpdatedAt)}>
              Edited by {editorName(chat.descriptionUpdatedBy, user) ?? 'someone'},{' '}
              {formatRelative(chat.descriptionUpdatedAt)}
            </span>
          )}
          <button type="button" className="link-button" onClick={open}>
            <Pencil size={12} aria-hidden="true" /> {description ? 'Edit' : 'Add description'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <form
      className="client-description editing"
      onSubmit={(event) => {
        event.preventDefault();
        save(baseVersion);
      }}
    >
      <textarea
        className="input note-input"
        rows={4}
        aria-label="Client description"
        placeholder="e.g. Corporate traveller, prefers aisle seats"
        maxLength={DESCRIPTION_MAX}
        value={draft}
        disabled={busy}
        autoFocus
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            save(baseVersion);
          } else if (event.key === 'Escape') {
            event.stopPropagation();
            close();
          }
        }}
      />
      {draft.length >= COUNTER_FROM && (
        <span className="muted small">
          {draft.length}/{DESCRIPTION_MAX}
        </span>
      )}
      {warning && (
        <p className="alert warn small" role="status">
          <CircleAlert size={14} aria-hidden="true" />
          {warning}
        </p>
      )}
      {error && (
        <p className="alert danger small" role="alert">
          {error}
        </p>
      )}

      {conflict ? (
        <div className="conflict" role="alert">
          <p className="small">
            Updated by {editorName(conflict.descriptionUpdatedBy, user) ?? 'someone'} while you
            were editing. Their version:
          </p>
          <p className="client-description-text conflict-text">
            {conflict.description || <span className="muted">(empty)</span>}
          </p>
          <div className="note-editor-actions">
            <button type="button" className="button ghost" onClick={discardMine} disabled={busy}>
              Discard mine
            </button>
            <button
              type="button"
              className="button primary"
              disabled={busy}
              onClick={() => save(conflict.profileVersion)}
            >
              Overwrite with mine
            </button>
          </div>
        </div>
      ) : (
        <div className="note-editor-actions">
          <button type="button" className="button ghost" onClick={close} disabled={busy}>
            Cancel
          </button>
          <button type="submit" className="button primary" disabled={busy}>
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      )}
    </form>
  );
}

function Tags({ chat, onChanged }) {
  const toast = useToast();
  const known = useKnownTags();
  const [tags, setTags] = useState(chat.tags ?? []);
  const [busy, setBusy] = useState(false);
  const tagsKey = (chat.tags ?? []).join('\u0000');

  // Follow the 3 s conversation poll (tags arrive with it).
  useEffect(() => {
    setTags(tagsKey ? tagsKey.split('\u0000') : []);
  }, [tagsKey]);

  // Phase 3: catalog tags join the suggestions (GET /api/tags is readable by everyone).
  const [catalog, setCatalog] = useState([]);
  useEffect(() => {
    let cancelled = false;
    api
      .listTagCatalog()
      .then((data) => {
        if (!cancelled) setCatalog(data.tags.map((t) => t.name));
      })
      .catch(() => {}); // suggestions only; free-form still works
    return () => {
      cancelled = true;
    };
  }, []);

  const suggestions = useMemo(
    () => [...new Set([...catalog, ...known])].sort((a, b) => a.localeCompare(b)),
    [catalog, known],
  );

  const run = async (action, failText) => {
    setBusy(true);
    try {
      const data = await action();
      setTags(data.tags);
      rememberTags(data.tags);
      onChanged?.();
      return true;
    } catch (err) {
      if (err.status !== 401) toast.error(`${failText}: ${errorText(err)}`);
      return false;
    } finally {
      setBusy(false);
    }
  };

  return (
    <TagInput
      tags={tags}
      suggestions={suggestions}
      busy={busy}
      onAdd={(tag) => run(() => api.addTag(chat.id, tag), 'Could not add tag')}
      onRemove={(tag) => run(() => api.removeTag(chat.id, tag), 'Could not remove tag')}
    />
  );
}

// F4: client profile in F1's details panel. Description and tags come with the 3 s
// conversation poll (chat object); notes are fetched only while the panel is open.
export function ClientPanel({ chat, open, onChanged }) {
  return (
    <>
      <section className="details-section" aria-labelledby="details-description">
        <h3 id="details-description">Description</h3>
        <Description key={chat.id} chat={chat} onChanged={onChanged} />
      </section>

      <section className="details-section" aria-labelledby="details-tags">
        <h3 id="details-tags">Tags</h3>
        <Tags key={chat.id} chat={chat} onChanged={onChanged} />
      </section>

      <section className="details-section" aria-labelledby="details-notes">
        <h3 id="details-notes">Internal notes</h3>
        {open ? (
          <NotesTimeline id={chat.id} />
        ) : (
          <p className="muted small">Open the panel to see notes.</p>
        )}
      </section>
    </>
  );
}
