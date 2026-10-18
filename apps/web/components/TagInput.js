'use client';

import { Plus, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { MAX_TAGS_PER_CHAT, TAG_REGEX, normalizeTag } from '../lib/constants.js';
import { useSuggestions } from './Dropdown.js';

const MAX_SUGGESTIONS = 8;

// F4: tag chips with remove buttons, plus an input with a suggestion menu. Shows the
// normalized form before saving ("VIP Client" → vip-client).
export function TagInput({ tags, suggestions = [], busy = false, onAdd, onRemove }) {
  const [draft, setDraft] = useState('');
  const inputRef = useRef(null);

  const normalized = normalizeTag(draft);
  const valid = TAG_REGEX.test(normalized);
  const full = tags.length >= MAX_TAGS_PER_CHAT;
  // Known tags not on this chat, prefix matches first, then other matches.
  const query = normalized || draft.trim().toLowerCase();
  const unused = suggestions.filter((tag) => !tags.includes(tag) && tag !== query);
  const options = (
    query
      ? [
          ...unused.filter((tag) => tag.startsWith(query)),
          ...unused.filter((tag) => !tag.startsWith(query) && tag.includes(query)),
        ]
      : unused
  ).slice(0, MAX_SUGGESTIONS);

  const add = async (tag) => {
    if (!TAG_REGEX.test(tag) || busy || full) return;
    const ok = await onAdd(tag);
    if (ok) setDraft('');
  };
  const submit = () => add(normalized);

  const { inputProps, menu } = useSuggestions({
    inputRef,
    suggestions: busy ? [] : options,
    onPick: add,
    label: 'Suggested tags',
  });

  return (
    <div className="tag-editor">
      {tags.length > 0 ? (
        <ul className="tag-list" aria-label="Tags">
          {tags.map((tag) => (
            <li key={tag} className="tag-chip">
              <span>{tag}</span>
              <button
                type="button"
                className="tag-chip-remove"
                aria-label={`Remove tag ${tag}`}
                title={`Remove ${tag}`}
                disabled={busy}
                onClick={() => onRemove(tag)}
              >
                <X size={12} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted small">No tags yet.</p>
      )}

      {full ? (
        <p className="field-hint">A chat can have at most {MAX_TAGS_PER_CHAT} tags.</p>
      ) : (
        <form
          className="tag-form"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <input
            ref={inputRef}
            className="input"
            {...inputProps}
            placeholder="Add a tag"
            aria-label="Add a tag"
            maxLength={64}
            value={draft}
            disabled={busy}
            onChange={(event) => setDraft(event.target.value)}
          />
          {menu}
          <button type="submit" className="button" disabled={!valid || busy} aria-label="Add tag">
            <Plus size={16} aria-hidden="true" />
          </button>
        </form>
      )}
      {draft.trim() && !full && (
        <p className={valid ? 'field-hint' : 'field-hint invalid'} aria-live="polite">
          {valid
            ? normalized !== draft
              ? `Saved as “${normalized}”`
              : null
            : 'Letters, digits, "-" or "_", up to 32 characters, starting with a letter or digit.'}
        </p>
      )}
    </div>
  );
}
