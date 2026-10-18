'use client';

import { Clock, Inbox, Search, SearchX, Tag, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../lib/client-api.js';
import { chatTitle, formatFull, formatListTime, isAwaitingReply } from '../lib/format.js';
import { rememberChatTags, useKnownTags } from '../lib/known-tags.js'; // F4
import { usePolling } from '../lib/use-polling.js';
import { useShortcuts } from '../lib/use-shortcuts.js';
import { Select } from './Dropdown.js';
import { Avatar, ChatListSkeleton, EmptyState, IconButton } from './ui.js';
import { useUser } from './UserContext.js';

const POLL_MS = 5000;
const ADMIN_FILTERS = [
  ['unassigned', 'Unassigned'],
  ['all', 'All'],
  ['mine', 'Mine'],
];
const EMPTY_TEXT = {
  unassigned: ['All caught up', 'New chats land here until someone is assigned.'],
  all: ['No chats yet', 'Chats appear when a client messages your WhatsApp number.'],
  mine: ['No chats assigned to you', 'Chats assigned to you show up here.'],
};

// F3: chats are addressed by their opaque publicId (chat.id), never the phone number.
const chatHref = (id) => `/chats/${encodeURIComponent(id)}`;

// F4: tag chips per row (max 3, then "+n").
const MAX_ROW_TAGS = 3;

// F4: the tag filter lives in the URL (?tag=) so it survives reloads and is shareable.
function readTagParam() {
  try {
    return new URLSearchParams(window.location.search).get('tag') ?? '';
  } catch {
    return '';
  }
}

function writeTagParam(tag) {
  const url = new URL(window.location.href);
  if (tag) url.searchParams.set('tag', tag);
  else url.searchParams.delete('tag');
  if (url.href !== window.location.href) window.history.replaceState(window.history.state, '', url);
}

function matches(chat, query) {
  // F3: search by name/preview, plus the number for admins (chat.phone is admin-only).
  const haystack = `${chat.displayName ?? ''} ${chat.phone ?? ''} ${chat.lastMessagePreview ?? ''}`;
  return haystack.toLowerCase().includes(query);
}

export function ChatList() {
  const user = useUser();
  const isAdmin = user.role === 'admin';
  const router = useRouter();
  const pathname = decodeURIComponent(usePathname());
  const searchRef = useRef(null);

  const [filter, setFilter] = useState(isAdmin ? 'unassigned' : 'mine');
  const [chats, setChats] = useState(null);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState('');
  const [tag, setTag] = useState(null); // F4: null until read from the URL
  const knownTags = useKnownTags();

  useEffect(() => {
    setTag(readTagParam());
  }, []);

  // Re-applied after navigation, which drops the query string.
  useEffect(() => {
    if (tag !== null) writeTagParam(tag);
  }, [tag, pathname]);

  usePolling(
    async () => {
      if (tag === null) return;
      try {
        const data = await api.listChats(filter, { tag });
        setChats(data.chats);
        rememberChatTags(data.chats);
        setError(null);
      } catch (err) {
        if (err.status !== 401) setError(err.message);
      }
    },
    POLL_MS,
    [filter, tag],
  );

  const q = query.trim().toLowerCase();
  const visible = useMemo(
    () => (chats && q ? chats.filter((c) => matches(c, q)) : chats),
    [chats, q],
  );
  const activeIndex = visible?.findIndex((c) => pathname === chatHref(c.id)) ?? -1;

  const step = (delta) => {
    if (!visible?.length) return;
    const next = activeIndex < 0 ? 0 : (activeIndex + delta + visible.length) % visible.length;
    router.push(chatHref(visible[next].id));
  };

  useShortcuts({
    '/': () => searchRef.current?.focus(),
    j: () => step(1),
    k: () => step(-1),
    Escape: (event) => {
      if (event.target !== searchRef.current) return false;
      setQuery('');
      searchRef.current.blur();
    },
  });

  const selectFilter = (next) => {
    if (next === filter) return;
    setChats(null);
    setFilter(next);
  };

  const selectTag = (next) => {
    if (next === tag) return;
    setChats(null);
    setTag(next);
  };
  const tagOptions = tag && !knownTags.includes(tag) ? [tag, ...knownTags] : knownTags;

  const [emptyTitle, emptyText] = tag
    ? ['No chats with this tag', `Nothing in this list is tagged “${tag}”.`]
    : EMPTY_TEXT[filter];

  return (
    <aside className="chat-list" aria-label="Chats">
      <div className="chat-list-header">
        <div className="chat-list-title">
          <h1 className="pane-title">Chats</h1>
          {chats && <span className="count-pill">{chats.length}</span>}
        </div>

        <div className="search">
          <Search size={16} aria-hidden="true" />
          <input
            ref={searchRef}
            className="input"
            type="search"
            placeholder="Search name or message"
            aria-label="Search chats"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <span className="search-aside">
            {query ? (
              <IconButton label="Clear search" onClick={() => setQuery('')}>
                <X size={14} />
              </IconButton>
            ) : (
              <kbd className="search-kbd" aria-hidden="true">
                /
              </kbd>
            )}
          </span>
        </div>

        {isAdmin && (
          <div className="segmented" role="tablist" aria-label="Filter chats">
            {ADMIN_FILTERS.map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={filter === value}
                onClick={() => selectFilter(value)}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        {/* F4: tag filter; combines with the tabs above. */}
        {(tagOptions.length > 0 || tag) && (
          <div className="tag-filter">
            <Select
              label="Filter by tag"
              size="sm"
              className="tag-filter-select"
              icon={Tag}
              value={tag ?? ''}
              options={[
                { value: '', label: 'All tags' },
                ...tagOptions.map((t) => ({ value: t, label: t })),
              ]}
              onChange={selectTag}
            />
          </div>
        )}
      </div>

      {error && (
        <p className="alert danger" role="alert" style={{ margin: 'var(--space-3)' }}>
          {error}
        </p>
      )}

      <div className="chat-items">
        {!chats && !error && <ChatListSkeleton />}

        {chats?.length === 0 && (
          <EmptyState icon={Inbox} title={emptyTitle}>
            {emptyText}
          </EmptyState>
        )}

        {chats?.length > 0 && visible.length === 0 && (
          <EmptyState icon={SearchX} title="No matches">
            Nothing matches “{query.trim()}” in this list.
          </EmptyState>
        )}

        <ul>
          {visible?.map((chat) => {
            const active = pathname === chatHref(chat.id);
            const awaiting = isAwaitingReply(chat) && chat.windowOpen;
            const title = chatTitle(chat);
            const classes = ['chat-item', active && 'active', awaiting && 'awaiting']
              .filter(Boolean)
              .join(' ');
            return (
              <li key={chat.id}>
                <Link
                  href={chatHref(chat.id)}
                  className={classes}
                  aria-current={active ? 'page' : undefined}
                >
                  <Avatar name={chat.clientName} id={chat.id} />
                  <div className="chat-item-body">
                    <div className="chat-item-top">
                      <span className="chat-item-title">{title}</span>
                      <time
                        className="chat-item-time"
                        dateTime={chat.lastMessageAt}
                        title={formatFull(chat.lastMessageAt)}
                      >
                        {formatListTime(chat.lastMessageAt)}
                      </time>
                    </div>
                    <div className="chat-item-bottom">
                      <span className="chat-item-preview">{chat.lastMessagePreview}</span>
                      {awaiting && (
                        <span className="awaiting-dot" title="Awaiting reply">
                          <span className="sr-only">Awaiting reply</span>
                        </span>
                      )}
                    </div>
                    <div className="chat-item-meta">
                      {isAdmin && filter !== 'unassigned' && (
                        <span className={chat.assignee ? 'badge' : 'badge info'}>
                          <span>{chat.assignee?.name ?? 'Unassigned'}</span>
                        </span>
                      )}
                      {!chat.windowOpen && (
                        <span className="badge warn">
                          <Clock size={12} aria-hidden="true" />
                          <span>Window closed</span>
                        </span>
                      )}
                      {chat.tags?.slice(0, MAX_ROW_TAGS).map((t) => (
                        <span key={t} className="badge tag">
                          <span>{t}</span>
                        </span>
                      ))}
                      {chat.tags?.length > MAX_ROW_TAGS && (
                        <span className="badge" title={chat.tags.slice(MAX_ROW_TAGS).join(', ')}>
                          <span>+{chat.tags.length - MAX_ROW_TAGS}</span>
                        </span>
                      )}
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </aside>
  );
}
