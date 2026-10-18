'use client';

import { Lock, Paperclip, SendHorizontal, X } from 'lucide-react';
import { useLayoutEffect, useRef, useState } from 'react';
import {
  ATTACH_ACCEPT,
  MEDIA_CAPTION_MAX,
  MESSAGE_TEXT_MAX,
  classifyFile,
} from '../lib/constants.js';
import { formatBytes } from './MessageBody.js';
import { IconButton } from './ui.js';

const COUNTER_FROM = MESSAGE_TEXT_MAX - 500;

// Enter sends, Shift+Enter adds a new line. The box grows with its content (up to ~6 lines).
// F2: the paperclip attaches one file; the text then becomes its caption (max 1024).
export function Composer({ windowOpen, onSend, onSendMedia }) {
  const [text, setText] = useState('');
  const [attachment, setAttachment] = useState(null); // { file, kind, mimeType }
  const [attachError, setAttachError] = useState(null);
  const inputRef = useRef(null);
  const fileRef = useRef(null);
  const limit = attachment ? MEDIA_CAPTION_MAX : MESSAGE_TEXT_MAX;

  useLayoutEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [text]);

  if (!windowOpen) {
    return (
      <div className="composer closed" role="status">
        <Lock size={16} aria-hidden="true" />
        The 24-hour reply window has closed. You can reply after the client messages again.
      </div>
    );
  }

  const submit = () => {
    const value = text.trim();
    if (attachment) {
      if (value.length > MEDIA_CAPTION_MAX) return;
      onSendMedia?.(attachment.file, attachment, attachment.kind === 'audio' ? '' : value);
      setAttachment(null);
    } else {
      if (!value) return;
      onSend(value);
    }
    setText('');
    inputRef.current?.focus();
  };

  const pickFile = (event) => {
    const file = event.target.files?.[0];
    event.target.value = ''; // allow picking the same file again
    if (!file) return;
    const result = classifyFile(file);
    if (result.error) {
      setAttachError(result.error);
      setAttachment(null);
      return;
    }
    setAttachError(null);
    setAttachment({ file, ...result });
    inputRef.current?.focus();
  };

  const removeAttachment = () => {
    setAttachment(null);
    setAttachError(null);
    fileRef.current?.focus();
  };

  return (
    <form
      className="composer"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      {onSendMedia && (
        <>
          <input
            ref={fileRef}
            type="file"
            className="sr-only"
            id="composer-file"
            accept={ATTACH_ACCEPT}
            tabIndex={-1}
            onChange={pickFile}
          />
          <IconButton
            label="Attach a file"
            className="round"
            onClick={() => fileRef.current?.click()}
          >
            <Paperclip size={20} />
          </IconButton>
        </>
      )}
      <div className="composer-box">
        {(attachment || attachError) && (
          <div className={`attach-chip ${attachError ? 'error' : ''}`} aria-live="polite">
            {attachment ? (
              <>
                <Paperclip size={14} aria-hidden="true" />
                <span className="attach-chip-name" title={attachment.file.name}>
                  {attachment.file.name}
                </span>
                <span className="attach-chip-meta">{formatBytes(attachment.file.size)}</span>
              </>
            ) : (
              <span role="alert">{attachError}</span>
            )}
            <button
              type="button"
              className="attach-chip-remove"
              aria-label={attachment ? 'Remove attachment' : 'Dismiss'}
              onClick={removeAttachment}
            >
              <X size={14} aria-hidden="true" />
            </button>
          </div>
        )}
        <textarea
          ref={inputRef}
          className="input composer-input"
          rows={1}
          placeholder={
            attachment
              ? attachment.kind === 'audio'
                ? 'Audio files are sent without a caption'
                : 'Add a caption (optional)'
              : 'Type a message'
          }
          aria-label={attachment ? 'Caption' : 'Message'}
          disabled={attachment?.kind === 'audio'}
          maxLength={limit}
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              submit();
            }
          }}
        />
        {text.length >= (attachment ? MEDIA_CAPTION_MAX - 200 : COUNTER_FROM) && (
          <span className={text.length > limit - 100 ? 'composer-counter near' : 'composer-counter'}>
            {text.length}/{limit}
          </span>
        )}
      </div>
      <IconButton
        label="Send message"
        type="submit"
        className="primary round"
        disabled={attachment ? text.trim().length > MEDIA_CAPTION_MAX : !text.trim()}
      >
        <SendHorizontal size={20} />
      </IconButton>
    </form>
  );
}
