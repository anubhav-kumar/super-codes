'use client';

import { CircleAlert, LoaderCircle, Plus, ShieldCheck, Tags, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useToast } from '../../../../components/Toast.js';
import { EmptyState } from '../../../../components/ui.js';
import { useUser } from '../../../../components/UserContext.js';
import { api, errorText } from '../../../../lib/client-api.js';
import { TAG_REGEX, normalizeTag } from '../../../../lib/constants.js';
import { formatDay } from '../../../../lib/format.js';

// F4 phase 3: admin tag catalog and the "catalog only" switch.
export default function TagsPage() {
  const user = useUser();
  const toast = useToast();
  const isAdmin = user.role === 'admin';
  const [catalog, setCatalog] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState(null);

  useEffect(() => {
    if (!isAdmin) return;
    api
      .listTagCatalog()
      .then(setCatalog)
      .catch((err) => setLoadError(errorText(err)));
  }, [isAdmin]);

  if (!isAdmin) {
    return (
      <div className="page">
        <EmptyState icon={ShieldCheck} title="Admins only">
          Only admins can manage tags.
        </EmptyState>
      </div>
    );
  }

  const normalized = normalizeTag(draft);
  const valid = TAG_REGEX.test(normalized);

  const add = async (event) => {
    event.preventDefault();
    if (!valid) return;
    setBusy(true);
    setFormError(null);
    try {
      const { tag } = await api.addCatalogTag(normalized);
      setCatalog((prev) => ({
        ...prev,
        tags: [...(prev?.tags ?? []), tag].sort((a, b) => a.name.localeCompare(b.name)),
      }));
      setDraft('');
    } catch (err) {
      setFormError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (name) => {
    if (!window.confirm(`Remove “${name}” from the catalog? Chats that have it keep it.`)) return;
    try {
      await api.removeCatalogTag(name);
      setCatalog((prev) => ({ ...prev, tags: prev.tags.filter((t) => t.name !== name) }));
    } catch (err) {
      toast.error(`Could not remove tag: ${errorText(err)}`);
    }
  };

  const toggleCatalogOnly = async (event) => {
    const next = event.target.checked;
    try {
      const { catalogOnly } = await api.setTagSettings(next);
      setCatalog((prev) => ({ ...prev, catalogOnly }));
      toast.success(catalogOnly ? 'Only catalog tags can be added now' : 'Any tag can be added now');
    } catch (err) {
      toast.error(`Could not change the setting: ${errorText(err)}`);
    }
  };

  return (
    <div className="page">
      <header className="page-header">
        <h1 className="page-title">Tags</h1>
        <p className="page-subtitle">
          Suggested tags for clients. Tags are internal and never sent to WhatsApp. Avoid tags
          that reveal health, religion or other sensitive traits.
        </p>
      </header>

      <section className="card" aria-labelledby="tag-settings">
        <h2 className="section-title" id="tag-settings">
          <ShieldCheck size={18} aria-hidden="true" />
          Tagging rules
        </h2>
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={Boolean(catalog?.catalogOnly)}
            disabled={!catalog}
            onChange={toggleCatalogOnly}
          />
          <span>
            Only allow tags from this catalog
            <span className="field-hint" style={{ display: 'block' }}>
              When off, agents and admins can add any tag. Existing tags on chats are kept
              either way.
            </span>
          </span>
        </label>
      </section>

      <section className="card" aria-labelledby="catalog">
        <h2 className="section-title" id="catalog">
          <Tags size={18} aria-hidden="true" />
          Catalog
          {catalog && <span className="count-pill">{catalog.tags.length}</span>}
        </h2>

        <form className="tag-form" onSubmit={add} style={{ maxWidth: 420 }}>
          <input
            className="input"
            placeholder="New tag, e.g. vip"
            aria-label="New tag"
            maxLength={64}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />
          <button type="submit" className="button primary" disabled={!valid || busy}>
            {busy ? (
              <LoaderCircle className="spin" size={16} aria-hidden="true" />
            ) : (
              <Plus size={16} aria-hidden="true" />
            )}
            Add
          </button>
        </form>
        {draft.trim() && (
          <p className="field-hint">
            {valid ? `Saved as “${normalized}”` : 'Letters, digits, "-" or "_", up to 32 characters.'}
          </p>
        )}
        {formError && (
          <p className="inline-error" role="alert">
            {formError}
          </p>
        )}

        {loadError && (
          <p className="alert danger" role="alert">
            <CircleAlert size={16} aria-hidden="true" />
            {loadError}
          </p>
        )}
        {!catalog && !loadError && <p className="muted small">Loading…</p>}
        {catalog?.tags.length === 0 && (
          <p className="muted small">No catalog tags yet. Tags are free-form until you add some.</p>
        )}
        {catalog?.tags.length > 0 && (
          <ul className="tag-list catalog">
            {catalog.tags.map((t) => (
              <li key={t.name} className="tag-chip" title={`Added ${formatDay(t.createdAt)}`}>
                <span>{t.name}</span>
                <button
                  type="button"
                  className="tag-chip-remove"
                  aria-label={`Remove ${t.name} from the catalog`}
                  onClick={() => remove(t.name)}
                >
                  <Trash2 size={12} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
