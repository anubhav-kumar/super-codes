'use client';

import Link from 'next/link';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { api, errorText } from '../lib/client-api.js';
import { chatTitle, formatDay, formatTime } from '../lib/format.js';
import { usePolling } from '../lib/use-polling.js';
import { AssignControl } from './AssignControl.js';
import { Composer } from './Composer.js';
import { useUser } from './UserContext.js';

const POLL_MS = 3000;
const PAGE_SIZE = 30;
const STICK_THRESHOLD_PX = 80;

const STATUS_LABEL = {
  pending: 'Sending…',
  sent: '✓',
  delivered: '✓✓',
  read: '✓✓',
};

const ACCESS_ERRORS = {
  FORBIDDEN: 'This chat is not assigned to you any more.',
  NOT_FOUND: 'Chat not found.',
  VALIDATION: 'That is not a valid chat address.',
};

// Newest-first lists → one oldest-first list without duplicates.
function mergeMessages(latest, older) {
  const seen = new Set();
  const merged = [];
  for (const m of [...latest, ...older]) {
    if (!seen.has(m.messageId)) {
      seen.add(m.messageId);
      merged.push(m);
    }
  }
  return merged.reverse();
}

function senderLabel(message, user, usersById) {
  if (message.senderId === user.userId) return 'You';
  const name = usersById?.get(message.senderId)?.name;
  const role = message.senderType === 'admin' ? 'Admin' : 'Agent';
  return name ? `${name} · ${role}` : role;
}

function StatusTick({ message }) {
  if (message.status === 'failed') {
    return (
      <span className="msg-status failed" title={message.errorCode ?? undefined}>
        Failed{message.errorCode ? ` (${message.errorCode})` : ''}
      </span>
    );
  }
  return (
    <span className={`msg-status ${message.status}`}>{STATUS_LABEL[message.status] ?? ''}</span>
  );
}

export function Conversation({ chatId }) {
  const user = useUser();
  const isAdmin = user.role === 'admin';

  const [chat, setChat] = useState(null);
  const [latest, setLatest] = useState([]); // newest first, from polling
  const [older, setOlder] = useState([]); // newest first, from "Load older"
  const [latestNextBefore, setLatestNextBefore] = useState(null);
  const [olderNextBefore, setOlderNextBefore] = useState(null);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [local, setLocal] = useState([]); // optimistic sends not yet confirmed
  const [accessError, setAccessError] = useState(null);
  const [pollError, setPollError] = useState(null);
  const [users, setUsers] = useState(null);

  const listRef = useRef(null);
  const stickToBottom = useRef(true);
  const preserveScroll = useRef(null);

  const refresh = useCallback(async () => {
    try {
      const data = await api.getMessages(chatId, { limit: PAGE_SIZE });
      setChat(data.chat);
      setLatest(data.messages);
      setLatestNextBefore(data.nextBefore);
      setAccessError(null);
      setPollError(null);
    } catch (err) {
      if (err.status === 401) return;
      if (ACCESS_ERRORS[err.code]) setAccessError(ACCESS_ERRORS[err.code]);
      else setPollError(err.message);
    }
  }, [chatId]);

  usePolling(refresh, POLL_MS, [chatId]);

  useEffect(() => {
    if (!isAdmin) return;
    api
      .listUsers()
      .then((data) => setUsers(data.users.filter((u) => u.active)))
      .catch(() => setUsers([]));
  }, [isAdmin]);

  const usersById = useMemo(() => new Map(users?.map((u) => [u.userId, u])), [users]);
  const messages = useMemo(() => mergeMessages(latest, older), [latest, older]);
  const hasOlder = older.length ? olderNextBefore !== null : latestNextBefore !== null;

  // Keep the view pinned to the newest message unless the user has scrolled up; when older
  // messages are prepended, keep the visible ones in place.
  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el) return;
    if (preserveScroll.current) {
      const { height, top } = preserveScroll.current;
      el.scrollTop = el.scrollHeight - height + top;
      preserveScroll.current = null;
    } else if (stickToBottom.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [messages.length, local.length]);

  const onScroll = () => {
    const el = listRef.current;
    stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < STICK_THRESHOLD_PX;
  };

  const loadOlder = async () => {
    const oldest = messages[0];
    if (!oldest || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const data = await api.getMessages(chatId, { before: oldest.messageId, limit: PAGE_SIZE });
      const el = listRef.current;
      preserveScroll.current = { height: el.scrollHeight, top: el.scrollTop };
      setOlder((prev) => [...prev, ...data.messages]);
      setOlderNextBefore(data.nextBefore);
    } catch (err) {
      if (err.status !== 401) setPollError(err.message);
    } finally {
      setLoadingOlder(false);
    }
  };

  const send = async (text, retryOf) => {
    const tempId = retryOf ?? `local-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    stickToBottom.current = true;
    setLocal((prev) => [
      ...prev.filter((m) => m.tempId !== tempId),
      { tempId, text, state: 'sending' },
    ]);
    try {
      const { message } = await api.sendMessage(chatId, text);
      setLocal((prev) => prev.filter((m) => m.tempId !== tempId));
      setLatest((prev) =>
        prev.some((m) => m.messageId === message.messageId) ? prev : [message, ...prev],
      );
    } catch (err) {
      if (err.code === 'WINDOW_EXPIRED' || err.code === 'FORBIDDEN') refresh();
      setLocal((prev) =>
        prev.map((m) =>
          m.tempId === tempId ? { ...m, state: 'error', error: errorText(err) } : m,
        ),
      );
    }
  };

  const discard = (tempId) => setLocal((prev) => prev.filter((m) => m.tempId !== tempId));

  if (accessError) {
    return (
      <div className="conversation empty">
        <p className="page-message">{accessError}</p>
        <Link href="/chats" className="button">
          Back to chats
        </Link>
      </div>
    );
  }
  if (!chat) {
    return (
      <div className="conversation empty">
        <p className="page-message muted">{pollError ?? 'Loading…'}</p>
      </div>
    );
  }

  let lastDay = null;
  return (
    <div className="conversation">
      <header className="conversation-header">
        <Link href="/chats" className="back-link" aria-label="Back to chats">
          ←
        </Link>
        <div className="conversation-title">
          <h2 className="pane-title">{chatTitle(chat)}</h2>
          <span className="muted small">
            {chat.chatId}
            {!isAdmin && ' · assigned to you'}
          </span>
        </div>
        {isAdmin && <AssignControl chat={chat} users={users} onAssigned={refresh} />}
      </header>

      {pollError && <p className="inline-error banner">Connection problem: {pollError}</p>}

      <div className="messages" ref={listRef} onScroll={onScroll}>
        {hasOlder && (
          <button type="button" className="button ghost load-older" onClick={loadOlder}>
            {loadingOlder ? 'Loading…' : 'Load older messages'}
          </button>
        )}

        {messages.map((m) => {
          const day = formatDay(m.createdAt);
          const divider = day !== lastDay;
          lastDay = day;
          const outbound = m.direction === 'out';
          return (
            <div key={m.messageId} className="msg-row-wrap">
              {divider && <div className="day-divider">{day}</div>}
              <div className={`msg-row ${outbound ? 'out' : 'in'}`}>
                <div
                  className={`msg ${outbound ? 'out' : 'in'} ${m.senderType === 'admin' ? 'by-admin' : ''}`}
                >
                  {outbound && <div className="msg-sender">{senderLabel(m, user, usersById)}</div>}
                  <div className="msg-text">{m.text}</div>
                  <div className="msg-meta">
                    <span>{formatTime(m.createdAt)}</span>
                    {outbound && <StatusTick message={m} />}
                  </div>
                </div>
              </div>
            </div>
          );
        })}

        {local.map((m) => (
          <div key={m.tempId} className="msg-row out">
            <div className={`msg out ${m.state === 'error' ? 'local-error' : ''}`}>
              <div className="msg-sender">You</div>
              <div className="msg-text">{m.text}</div>
              <div className="msg-meta">
                {m.state === 'sending' ? (
                  <span className="msg-status pending">Sending…</span>
                ) : (
                  <>
                    <span className="msg-status failed">Not sent: {m.error}</span>
                    <button
                      type="button"
                      className="link-button"
                      onClick={() => send(m.text, m.tempId)}
                    >
                      Retry
                    </button>
                    <button type="button" className="link-button" onClick={() => discard(m.tempId)}>
                      Discard
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        ))}

        {messages.length === 0 && local.length === 0 && (
          <p className="page-message muted">No messages yet.</p>
        )}
      </div>

      <Composer windowOpen={chat.windowOpen} onSend={(text) => send(text)} />
    </div>
  );
}
