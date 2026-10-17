'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { api } from '../lib/client-api.js';
import { chatTitle, formatListTime } from '../lib/format.js';
import { usePolling } from '../lib/use-polling.js';
import { useUser } from './UserContext.js';

const POLL_MS = 5000;
const ADMIN_FILTERS = [
  ['unassigned', 'Unassigned'],
  ['all', 'All'],
  ['mine', 'Mine'],
];

export function ChatList() {
  const user = useUser();
  const isAdmin = user.role === 'admin';
  const pathname = decodeURIComponent(usePathname());

  const [filter, setFilter] = useState(isAdmin ? 'unassigned' : 'mine');
  const [chats, setChats] = useState(null);
  const [error, setError] = useState(null);

  usePolling(
    async () => {
      try {
        const data = await api.listChats(filter);
        setChats(data.chats);
        setError(null);
      } catch (err) {
        if (err.status !== 401) setError(err.message);
      }
    },
    POLL_MS,
    [filter],
  );

  const selectFilter = (next) => {
    if (next === filter) return;
    setChats(null);
    setFilter(next);
  };

  return (
    <aside className="chat-list">
      <div className="chat-list-header">
        <h1 className="pane-title">Chats</h1>
        {isAdmin && (
          <div className="tabs" role="tablist">
            {ADMIN_FILTERS.map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={filter === value}
                className={filter === value ? 'tab active' : 'tab'}
                onClick={() => selectFilter(value)}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      {error && <p className="inline-error">{error}</p>}
      {!chats && !error && <p className="list-message muted">Loading…</p>}
      {chats?.length === 0 && (
        <p className="list-message muted">
          {filter === 'unassigned' ? 'No unassigned chats.' : 'No chats yet.'}
        </p>
      )}

      <ul className="chat-items">
        {chats?.map((chat) => {
          const href = `/chats/${encodeURIComponent(chat.chatId)}`;
          const active = pathname === `/chats/${chat.chatId}`;
          return (
            <li key={chat.chatId}>
              <Link href={href} className={active ? 'chat-item active' : 'chat-item'}>
                <div className="chat-item-top">
                  <span className="chat-item-title">{chatTitle(chat)}</span>
                  <span className="chat-item-time">{formatListTime(chat.lastMessageAt)}</span>
                </div>
                <div className="chat-item-preview">{chat.lastMessagePreview}</div>
                <div className="chat-item-meta">
                  {isAdmin && filter !== 'unassigned' && (
                    <span className="badge">{chat.assignee?.name ?? 'Unassigned'}</span>
                  )}
                  {!chat.windowOpen && <span className="badge warn">Window closed</span>}
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
