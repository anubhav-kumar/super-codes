'use client';

import { Clock, Hourglass, StickyNote, Tag, UserRound, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { chatTitle, formatDuration, formatFull } from '../lib/format.js';
import { Avatar, IconButton } from './ui.js';

const WINDOW_MS = 24 * 60 * 60 * 1000;
const LOW_MS = 2 * 60 * 60 * 1000;
const TICK_MS = 30 * 1000;

// Re-renders every 30 s so the reply-window countdown stays current.
function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(timer);
  }, []);
  return now;
}

function ReplyWindow({ chat }) {
  const now = useNow();
  const remaining = chat.lastClientMessageAt
    ? Date.parse(chat.lastClientMessageAt) + WINDOW_MS - now
    : 0;
  const open = chat.windowOpen && remaining > 0;
  const percent = open ? Math.max(2, Math.min(100, (remaining / WINDOW_MS) * 100)) : 0;

  return (
    <div className="details-row">
      <Hourglass size={16} aria-hidden="true" />
      <div style={{ display: 'grid', gap: 6, flex: 1 }}>
        <span className="details-row-label">Reply window</span>
        <span>
          {open ? `Open · ${formatDuration(remaining)} left` : 'Closed until the client writes'}
        </span>
        <div
          className={remaining < LOW_MS ? 'window-meter low' : 'window-meter'}
          role="meter"
          aria-label="Reply window remaining"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(percent)}
        >
          <span style={{ width: `${percent}%` }} />
        </div>
      </div>
    </div>
  );
}

// Right-hand panel (F1). Description, notes and tags arrive with F4.
export function DetailsPanel({ chat, open, onClose }) {
  const title = chatTitle(chat);
  return (
    <>
      <button
        type="button"
        className={open ? 'details-backdrop open' : 'details-backdrop'}
        aria-label="Close client details"
        tabIndex={-1}
        onClick={onClose}
      />
      <aside
        id="client-details"
        className={open ? 'details open' : 'details'}
        aria-label="Client details"
      >
        <div className="details-header">
          <h2>Client details</h2>
          <IconButton label="Close client details" onClick={onClose}>
            <X size={18} />
          </IconButton>
        </div>

        <div className="details-profile">
          <Avatar name={chat.clientName} id={chat.chatId} size="lg" />
          <p className="details-name">{title}</p>
          <span className="muted small">{chat.chatId}</span>
        </div>

        <section className="details-section" aria-labelledby="details-conversation">
          <h3 id="details-conversation">Conversation</h3>
          <div className="details-row">
            <UserRound size={16} aria-hidden="true" />
            <div style={{ display: 'grid' }}>
              <span className="details-row-label">Assigned to</span>
              <span>{chat.assignee?.name ?? 'Unassigned'}</span>
            </div>
          </div>
          <div className="details-row">
            <Clock size={16} aria-hidden="true" />
            <div style={{ display: 'grid' }}>
              <span className="details-row-label">Last message</span>
              <span>{formatFull(chat.lastMessageAt)}</span>
            </div>
          </div>
          <ReplyWindow chat={chat} />
        </section>

        <section className="details-section" aria-labelledby="details-profile">
          <h3 id="details-profile">Client profile</h3>
          <div className="details-placeholder">
            <span className="details-placeholder-icons" aria-hidden="true">
              <StickyNote size={18} />
              <Tag size={18} />
            </span>
            Description, notes and tags for this client are coming soon.
          </div>
        </section>
      </aside>
    </>
  );
}
