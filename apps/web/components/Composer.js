'use client';

import { useState } from 'react';
import { MESSAGE_TEXT_MAX } from '../lib/constants.js';

// Enter sends, Shift+Enter adds a new line.
export function Composer({ windowOpen, onSend }) {
  const [text, setText] = useState('');

  if (!windowOpen) {
    return (
      <div className="composer closed">
        The 24-hour reply window has closed. You can reply after the client messages again.
      </div>
    );
  }

  const submit = () => {
    const value = text.trim();
    if (!value) return;
    onSend(value);
    setText('');
  };

  return (
    <form
      className="composer"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <textarea
        className="input composer-input"
        rows={2}
        placeholder="Type a message"
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
      <button type="submit" className="button primary" disabled={!text.trim()}>
        Send
      </button>
    </form>
  );
}
