'use client';

import {
  ArrowDown,
  ArrowLeft,
  Check,
  CheckCheck,
  CircleAlert,
  Clock,
  Lock,
  PanelRight,
  ShieldCheck,
  WifiOff,
} from 'lucide-react';
import Link from 'next/link';
import {
  Fragment,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { api, errorText, uploadFile } from '../lib/client-api.js';
import { chatTitle, formatDay, formatDayLabel, formatFull, formatTime } from '../lib/format.js';
import { readPref, writePref } from '../lib/prefs.js';
import { usePolling } from '../lib/use-polling.js';
import { useShortcuts } from '../lib/use-shortcuts.js';
import { AssignControl } from './AssignControl.js';
import { Composer } from './Composer.js';
import { DetailsPanel } from './DetailsPanel.js';
import { LocalMediaPreview, MessageBody } from './MessageBody.js'; // F2
import { useToast } from './Toast.js';
import { Avatar, EmptyState, IconButton, MessagesSkeleton } from './ui.js';
import { useUser } from './UserContext.js';

const POLL_MS = 3000;
const PAGE_SIZE = 30;
const STICK_THRESHOLD_PX = 80;
const GROUP_WINDOW_MS = 5 * 60 * 1000;
const WIDE_QUERY = '(min-width: 1280px)';

const ACCESS_ERRORS = {
  FORBIDDEN: 'This chat is not assigned to you any more.',
  NOT_FOUND: 'Chat not found.',
  VALIDATION: 'That is not a valid chat address.',
};

const STATUS = {
  pending: [Clock, 'Sending'],
  sent: [Check, 'Sent'],
  delivered: [CheckCheck, 'Delivered'],
  read: [CheckCheck, 'Read'],
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

// Consecutive messages from the same side and sender, same day, within 5 minutes.
function isGroupedWith(prev, m) {
  if (!prev || prev.direction !== m.direction) return false;
  if (m.direction === 'out' && prev.senderId !== m.senderId) return false;
  if (formatDay(prev.createdAt) !== formatDay(m.createdAt)) return false;
  return Date.parse(m.createdAt) - Date.parse(prev.createdAt) < GROUP_WINDOW_MS;
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
        <CircleAlert size={13} aria-hidden="true" />
        Failed{message.errorCode ? ` (${message.errorCode})` : ''}
      </span>
    );
  }
  const [Icon, label] = STATUS[message.status] ?? [];
  if (!Icon) return null;
  return (
    <span className={`msg-status ${message.status}`} title={label}>
      <Icon size={15} aria-hidden="true" />
      <span className="sr-only">{label}</span>
    </span>
  );
}

function useDetailsPanel() {
  const [open, setOpen] = useState(false);
  const [wide, setWide] = useState(false);

  useEffect(() => {
    const media = window.matchMedia(WIDE_QUERY);
    const sync = () => {
      setWide(media.matches);
      setOpen(media.matches && readPref('details', 'open') !== 'closed');
    };
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);

  const set = (next) => {
    setOpen(next);
    if (wide) writePref('details', next ? 'open' : 'closed');
  };
  return { open, wide, set };
}

// F3: `id` is the chat's opaque publicId (from the [id] route); never the phone number.
export function Conversation({ id }) {
  const user = useUser();
  const toast = useToast();
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
  const [showJump, setShowJump] = useState(false);
  const details = useDetailsPanel();

  const listRef = useRef(null);
  const stickToBottom = useRef(true);
  const preserveScroll = useRef(null);
  const newestSeen = useRef(null);

  const refresh = useCallback(async () => {
    try {
      const data = await api.getMessages(id, { limit: PAGE_SIZE });
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
  }, [id]);

  usePolling(refresh, POLL_MS, [id]);

  useEffect(() => {
    if (pollError) toast.error('Connection problem. Retrying…');
  }, [pollError, toast]);

  useEffect(() => {
    if (!isAdmin) return;
    api
      .listUsers()
      .then((data) => setUsers(data.users.filter((u) => u.active)))
      .catch(() => setUsers([]));
  }, [isAdmin]);

  useShortcuts({
    Escape: () => {
      if (details.wide || !details.open) return false;
      details.set(false);
    },
  });

  const usersById = useMemo(() => new Map(users?.map((u) => [u.userId, u])), [users]);
  const messages = useMemo(() => mergeMessages(latest, older), [latest, older]);
  const hasOlder = older.length ? olderNextBefore !== null : latestNextBefore !== null;
  const newestId = messages.at(-1)?.messageId ?? null;

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
    } else if (newestSeen.current && newestId && newestId !== newestSeen.current) {
      setShowJump(true);
    }
    newestSeen.current = newestId;
  }, [messages.length, local.length, newestId]);

  const onScroll = () => {
    const el = listRef.current;
    stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < STICK_THRESHOLD_PX;
    if (stickToBottom.current) setShowJump(false);
  };

  const jumpToLatest = () => {
    const el = listRef.current;
    stickToBottom.current = true;
    setShowJump(false);
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  };

  const loadOlder = async () => {
    const oldest = messages[0];
    if (!oldest || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const data = await api.getMessages(id, { before: oldest.messageId, limit: PAGE_SIZE });
      const el = listRef.current;
      preserveScroll.current = { height: el.scrollHeight, top: el.scrollTop };
      setOlder((prev) => [...prev, ...data.messages]);
      setOlderNextBefore(data.nextBefore);
    } catch (err) {
      if (err.status !== 401) toast.error(`Could not load older messages: ${err.message}`);
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
      const { message } = await api.sendMessage(id, text);
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

  // F2: upload the file straight to S3 (with progress), then send the media message.
  const sendMedia = async (file, { mimeType }, caption, retryOf) => {
    const tempId = retryOf ?? `local-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const patch = (fields) =>
      setLocal((prev) => prev.map((m) => (m.tempId === tempId ? { ...m, ...fields } : m)));
    stickToBottom.current = true;
    setLocal((prev) => [
      ...prev.filter((m) => m.tempId !== tempId),
      {
        tempId,
        text: caption,
        media: { file, mimeType, caption },
        state: 'uploading',
        progress: 0,
      },
    ]);
    try {
      const upload = await api.createUpload(id, { mimeType, size: file.size, filename: file.name });
      await uploadFile(upload, file, { onProgress: (progress) => patch({ progress }) });
      patch({ state: 'sending' });
      const { message } = await api.sendMedia(id, {
        type: upload.kind,
        uploadId: upload.uploadId,
        caption,
        filename: file.name,
      });
      setLocal((prev) => prev.filter((m) => m.tempId !== tempId));
      setLatest((prev) =>
        prev.some((m) => m.messageId === message.messageId) ? prev : [message, ...prev],
      );
    } catch (err) {
      if (err.code === 'WINDOW_EXPIRED' || err.code === 'FORBIDDEN') refresh();
      patch({ state: 'error', error: errorText(err) });
    }
  };

  const discard = (tempId) => setLocal((prev) => prev.filter((m) => m.tempId !== tempId));

  if (accessError) {
    return (
      <div className="conversation empty">
        <EmptyState icon={Lock} title="No access">
          {accessError}
        </EmptyState>
        <Link href="/chats" className="button">
          Back to chats
        </Link>
      </div>
    );
  }

  const title = chat ? chatTitle(chat) : '';
  let lastDay = null;
  let prev = null;

  return (
    <div className="conversation-wrap">
      <section
        className="conversation"
        aria-label={title ? `Conversation with ${title}` : 'Conversation'}
      >
        <header className="conversation-header">
          <Link href="/chats" className="icon-button back-link" aria-label="Back to chats">
            <ArrowLeft size={20} aria-hidden="true" />
          </Link>
          {chat && <Avatar name={chat.clientName} id={chat.id} />}
          <div className="conversation-title">
            <h2>{title || ' '}</h2>
            {chat && (
              <span className="conversation-subtitle">
                {/* F3: the number reaches the browser for admins only (chat.phone). */}
                {chat.phone && (
                  <>
                    <span>{chat.phone}</span>
                    <span aria-hidden="true">·</span>
                  </>
                )}
                <span>{chat.assignee ? `Assigned to ${chat.assignee.name}` : 'Unassigned'}</span>
                {pollError && (
                  <span className="connection-dot" title={pollError}>
                    <WifiOff size={12} aria-hidden="true" />
                    Reconnecting
                  </span>
                )}
              </span>
            )}
          </div>
          <div className="header-actions">
            {isAdmin && chat && <AssignControl chat={chat} users={users} onAssigned={refresh} />}
            {chat && (
              <IconButton
                label={details.open ? 'Hide client details' : 'Show client details'}
                aria-pressed={details.open}
                aria-controls="client-details"
                onClick={() => details.set(!details.open)}
              >
                <PanelRight size={20} />
              </IconButton>
            )}
          </div>
        </header>

        <div className="messages-area">
          <div className="messages-scroll" ref={listRef} onScroll={onScroll}>
            {!chat && <MessagesSkeleton />}
            {chat && (
              <div className="messages-inner">
                {hasOlder && (
                  <button
                    type="button"
                    className="button load-older"
                    onClick={loadOlder}
                    disabled={loadingOlder}
                  >
                    {loadingOlder ? 'Loading…' : 'Load older messages'}
                  </button>
                )}

                <div role="log" aria-label="Messages" className="message-log">
                  {messages.map((m) => {
                    const day = formatDay(m.createdAt);
                    const divider = day !== lastDay;
                    const grouped = !divider && isGroupedWith(prev, m);
                    lastDay = day;
                    prev = m;
                    const outbound = m.direction === 'out';
                    const byAdmin = outbound && m.senderType === 'admin';
                    return (
                      <Fragment key={m.messageId}>
                        {divider && (
                          <div className="day-divider">{formatDayLabel(m.createdAt)}</div>
                        )}
                        <div
                          className={`msg-row ${outbound ? 'out' : 'in'} ${grouped ? 'grouped' : ''}`}
                        >
                          <div
                            className={`msg ${outbound ? 'out' : 'in'} ${byAdmin ? 'by-admin' : ''}`}
                          >
                            {outbound && !grouped && (
                              <div className="msg-sender">
                                {byAdmin && <ShieldCheck size={12} aria-hidden="true" />}
                                {senderLabel(m, user, usersById)}
                                {byAdmin && m.senderId !== user.userId && (
                                  <span className="sr-only">, sent by admin</span>
                                )}
                              </div>
                            )}
                            <MessageBody message={m} chatKey={id} />
                            <div className="msg-meta">
                              <time dateTime={m.createdAt} title={formatFull(m.createdAt)}>
                                {formatTime(m.createdAt)}
                              </time>
                              {outbound && <StatusTick message={m} />}
                            </div>
                          </div>
                        </div>
                      </Fragment>
                    );
                  })}

                  {local.map((m) => (
                    <div key={m.tempId} className="msg-row out">
                      <div className={`msg out ${m.state === 'error' ? 'local-error' : ''}`}>
                        <div className="msg-sender">You</div>
                        {m.media ? (
                          <LocalMediaPreview item={m} />
                        ) : (
                          <div className="msg-text">{m.text}</div>
                        )}
                        <div className="msg-meta">
                          {m.state !== 'error' ? (
                            <span className="msg-status pending" aria-live="polite">
                              <Clock size={13} aria-hidden="true" />
                              {m.state === 'uploading'
                                ? `Uploading… ${Math.round((m.progress ?? 0) * 100)}%`
                                : 'Sending…'}
                            </span>
                          ) : (
                            <>
                              <span className="msg-status failed">
                                <CircleAlert size={13} aria-hidden="true" />
                                Not sent: {m.error}
                              </span>
                              <button
                                type="button"
                                className="link-button"
                                onClick={() =>
                                  m.media
                                    ? sendMedia(m.media.file, m.media, m.media.caption, m.tempId)
                                    : send(m.text, m.tempId)
                                }
                              >
                                Retry
                              </button>
                              <button
                                type="button"
                                className="link-button"
                                onClick={() => discard(m.tempId)}
                              >
                                Discard
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {messages.length === 0 && local.length === 0 && (
                  <EmptyState icon={Clock} title="No messages yet">
                    Messages appear here as soon as they arrive.
                  </EmptyState>
                )}
              </div>
            )}
          </div>

          {showJump && (
            <button type="button" className="button jump-latest" onClick={jumpToLatest}>
              <ArrowDown size={16} aria-hidden="true" />
              New messages
            </button>
          )}
        </div>

        {chat && (
          <Composer
            windowOpen={chat.windowOpen}
            onSend={(text) => send(text)}
            onSendMedia={(file, info, caption) => sendMedia(file, info, caption)} // F2
          />
        )}
      </section>

      {chat && (
        <DetailsPanel
          chat={chat}
          open={details.open}
          onClose={() => details.set(false)}
          onChanged={refresh} // F4: re-read description/tags after an edit
        />
      )}
    </div>
  );
}
