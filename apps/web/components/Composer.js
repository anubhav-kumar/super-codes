'use client';

import { Lock, SendHorizontal } from 'lucide-react';
import { useLayoutEffect, useRef, useState } from 'react';
import { MESSAGE_TEXT_MAX } from '../lib/constants.js';
import { IconButton } from './ui.js';

const COUNTER_FROM = MESSAGE_TEXT_MAX - 500;

// Enter sends, Shift+Enter adds a new line. The box grows with its content (up to ~6 lines).
export function Composer({ windowOpen, onSend }) {
  const [text, setText] = useState('');
  const inputRef = useRef(null);

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
    if (!value) return;
    onSend(value);
    setText('');
    inputRef.current?.focus();
  };

  return (
    <form
      className="composer"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <div className="composer-box">
        <textarea
          ref={inputRef}
          className="input composer-input"
          rows={1}
          placeholder="Type a message"
          aria-label="Message"
          maxLength={MESSAGE_TEXT_MAX}
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              submit();
            }
          }}
        />
        {text.length >= COUNTER_FROM && (
          <span
            className={
              text.length > MESSAGE_TEXT_MAX - 100 ? 'composer-counter near' : 'composer-counter'
            }
          >
            {text.length}/{MESSAGE_TEXT_MAX}
          </span>
        )}
      </div>
      <IconButton
        label="Send message"
        type="submit"
        className="primary round"
        disabled={!text.trim()}
      >
        <SendHorizontal size={20} />
      </IconButton>
    </form>
  );
}
