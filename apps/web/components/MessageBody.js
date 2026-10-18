'use client';

// F2: the inside of a message bubble, per message type. Media loads through
// /api/chats/[id]/messages/[messageId]/media (access-checked, redirects to a short-lived S3
// link), so the browser never stores S3 URLs.
import {
  AlertTriangle,
  Contact,
  Download,
  FileText,
  ImageOff,
  Loader2,
  MapPin,
  Mic,
  Paperclip,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { api } from '../lib/client-api.js';

const MEDIA_TYPES = new Set(['image', 'video', 'audio', 'document', 'sticker']);

// A ready file may still be under malware scan (the route answers 409 and the element fails to
// load). Retry a few times before giving up.
const RETRY_DELAY_MS = 5000;
const MAX_RETRIES = 6;

// Friendly hints for Cloud API errors on outbound media (the code is shown as well).
const SEND_ERROR_HINTS = {
  131053:
    'WhatsApp rejected the file format. For video use MP4 (H.264 + AAC); otherwise try another file.',
  MALWARE: 'The file was blocked by the malware scan.',
  SCAN_FAILED: 'The file could not be scanned, so it was not sent.',
  CONTENT_MISMATCH: 'The file content does not match its type.',
  TOO_LARGE: 'The file is over the size limit.',
};

export function formatBytes(bytes) {
  if (!Number.isFinite(bytes)) return '';
  if (bytes < 1000) return `${bytes} B`;
  if (bytes < 1_000_000) return `${Math.round(bytes / 1000)} KB`;
  return `${(bytes / 1_000_000).toFixed(1)} MB`;
}

export function MessageBody({ message, chatKey }) {
  const { type } = message;
  let body;
  if (MEDIA_TYPES.has(type) && message.media) {
    body = <MediaBody message={message} chatKey={chatKey} />;
  } else if (type === 'location' && message.location) {
    body = <LocationBody location={message.location} />;
  } else if (type === 'contacts' && message.contacts) {
    body = <ContactsBody contacts={message.contacts} />;
  } else {
    body = (
      <div className={`msg-text ${type === 'unsupported' ? 'msg-unsupported' : ''}`}>
        {message.text}
      </div>
    );
  }

  const hint =
    message.direction === 'out' && message.status === 'failed'
      ? SEND_ERROR_HINTS[message.errorCode]
      : null;
  const reaction = message.reactions?.client;

  return (
    <>
      {body}
      {hint && (
        <div className="msg-media-note" role="note">
          <AlertTriangle size={13} aria-hidden="true" />
          {hint}
        </div>
      )}
      {reaction && (
        <span className="msg-reaction" title="Client reaction">
          <span aria-hidden="true">{reaction}</span>
          <span className="sr-only">Client reacted {reaction}</span>
        </span>
      )}
    </>
  );
}

function MediaBody({ message, chatKey }) {
  const { media, type } = message;
  const caption = media.caption ? <div className="msg-text">{media.caption}</div> : null;

  if (media.state === 'pending') {
    return (
      <>
        <div className="media-placeholder" role="status">
          <Loader2 size={16} className="spin" aria-hidden="true" />
          Loading media…
        </div>
        {caption}
      </>
    );
  }
  if (media.state !== 'ready') {
    const text =
      media.state === 'too_large'
        ? 'File too large to receive. Ask the client to send a smaller file.'
        : media.state === 'expired'
          ? 'Media expired. Ask the client to resend it if needed.'
          : 'Media unavailable. Ask the client to resend.';
    return (
      <>
        <div className="media-placeholder unavailable">
          <ImageOff size={16} aria-hidden="true" />
          {text}
        </div>
        {caption}
      </>
    );
  }

  const url = api.mediaUrl(chatKey, message.messageId);
  return (
    <>
      <MediaElement type={type} media={media} url={url} inbound={message.direction === 'in'} />
      {caption}
    </>
  );
}

function MediaElement({ type, media, url, inbound }) {
  const [attempt, setAttempt] = useState(0);
  const [failed, setFailed] = useState(false);
  const [waiting, setWaiting] = useState(false);

  useEffect(() => {
    if (!waiting) return undefined;
    const timer = setTimeout(() => {
      setWaiting(false);
      setAttempt((n) => n + 1);
    }, RETRY_DELAY_MS);
    return () => clearTimeout(timer);
  }, [waiting]);

  const onError = () => {
    if (attempt >= MAX_RETRIES) setFailed(true);
    else setWaiting(true);
  };
  const src = attempt ? `${url}?r=${attempt}` : url;

  if (type === 'document') return <DocumentCard media={media} url={url} />;

  if (failed) {
    return (
      <div className="media-placeholder unavailable">
        <ImageOff size={16} aria-hidden="true" />
        Media unavailable (it may still be scanned for malware).
        <button
          type="button"
          className="link-button"
          onClick={() => {
            setFailed(false);
            setAttempt((n) => n + 1);
          }}
        >
          Retry
        </button>
      </div>
    );
  }
  if (waiting) {
    return (
      <div className="media-placeholder" role="status">
        <Loader2 size={16} className="spin" aria-hidden="true" />
        Checking the file…
      </div>
    );
  }

  if (type === 'image' || type === 'sticker') {
    const alt = media.caption || (type === 'sticker' ? 'Sticker' : inbound ? 'Photo from client' : 'Photo');
    return (
      <a href={src} target="_blank" rel="noopener noreferrer" className="media-image-link">
        <img
          key={attempt}
          src={src}
          alt={alt}
          loading="lazy"
          className={type === 'sticker' ? 'media-sticker' : 'media-image'}
          onError={onError}
        />
      </a>
    );
  }
  if (type === 'audio') {
    return (
      <div className="media-audio">
        {media.voice && (
          <span className="media-label">
            <Mic size={13} aria-hidden="true" />
            Voice note
          </span>
        )}
        <audio key={attempt} controls preload="none" src={src} onError={onError}>
          Your browser cannot play this audio.
        </audio>
      </div>
    );
  }
  if (type === 'video') {
    return (
      <video
        key={attempt}
        className="media-video"
        controls
        preload="metadata"
        src={src}
        onError={onError}
      >
        Your browser cannot play this video.
      </video>
    );
  }
  return null;
}

function DocumentCard({ media, url }) {
  const name = media.filename || 'Document';
  return (
    <div className="media-file">
      <FileText size={28} aria-hidden="true" className="media-file-icon" />
      <div className="media-file-info">
        <span className="media-file-name" title={name}>
          {name}
        </span>
        <span className="media-file-meta">{formatBytes(media.size)}</span>
      </div>
      <a href={url} className="icon-button" aria-label={`Download ${name}`} download>
        <Download size={18} aria-hidden="true" />
      </a>
    </div>
  );
}

function LocationBody({ location }) {
  const { latitude, longitude, name, address } = location;
  const href = `https://www.google.com/maps?q=${encodeURIComponent(`${latitude},${longitude}`)}`;
  return (
    <div className="media-location">
      <MapPin size={18} aria-hidden="true" />
      <div>
        <div className="media-location-name">{name || 'Shared location'}</div>
        {address && <div className="media-location-address">{address}</div>}
        <a href={href} target="_blank" rel="noopener noreferrer">
          Open in map
        </a>
      </div>
    </div>
  );
}

// Decision D6: only the name and how many numbers the card had.
function ContactsBody({ contacts }) {
  return (
    <div className="media-contacts">
      {contacts.map((c, i) => (
        <div key={i} className="media-contact">
          <Contact size={16} aria-hidden="true" />
          <span>
            Contact: {c.formattedName || 'Unnamed'}
            {c.phoneCount ? ` (${c.phoneCount} ${c.phoneCount === 1 ? 'number' : 'numbers'})` : ''}
          </span>
        </div>
      ))}
      <div className="media-file-meta">Details aren’t stored. Ask the client if you need them.</div>
    </div>
  );
}

// Optimistic bubble for a file being uploaded or sent.
export function LocalMediaPreview({ item }) {
  const percent = Math.round((item.progress ?? 0) * 100);
  return (
    <>
      <div className="media-file">
        <Paperclip size={22} aria-hidden="true" className="media-file-icon" />
        <div className="media-file-info">
          <span className="media-file-name" title={item.media.file.name}>
            {item.media.file.name}
          </span>
          <span className="media-file-meta">{formatBytes(item.media.file.size)}</span>
          {item.state === 'uploading' && (
            <progress className="upload-progress" max={100} value={percent} aria-label="Upload progress" />
          )}
        </div>
      </div>
      {item.media.caption && <div className="msg-text">{item.media.caption}</div>}
    </>
  );
}
