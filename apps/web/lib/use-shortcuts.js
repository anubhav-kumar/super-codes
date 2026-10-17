'use client';

import { useEffect, useRef } from 'react';

// True while the user is typing somewhere; single-key shortcuts must not fire then.
function isTyping(target) {
  if (!target || !(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

// handlers: { '/': fn, j: fn, k: fn, '?': fn, Escape: fn }. Escape also fires while typing.
export function useShortcuts(handlers) {
  const saved = useRef(handlers);
  useEffect(() => {
    saved.current = handlers;
  });

  useEffect(() => {
    const onKey = (event) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
      const handler = saved.current[key] ?? saved.current[event.key];
      if (!handler) return;
      if (key !== 'Escape' && isTyping(event.target)) return;
      if (document.querySelector('dialog[open]') && key !== 'Escape') return;
      const handled = handler(event);
      if (handled !== false) event.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
