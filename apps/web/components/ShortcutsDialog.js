'use client';

import { X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { IconButton } from './ui.js';

const SHORTCUTS = [
  ['/', 'Search chats'],
  ['J', 'Next chat'],
  ['K', 'Previous chat'],
  ['Esc', 'Clear search or close panel'],
  ['Enter', 'Send message'],
  ['Shift + Enter', 'New line'],
  ['?', 'Show this list'],
];

// Native <dialog>: focus trap, Esc to close and backdrop come for free.
export function ShortcutsDialog({ open, onClose }) {
  const ref = useRef(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="dialog"
      aria-labelledby="shortcuts-title"
      onClose={onClose}
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
    >
      <div className="dialog-header">
        <h2 id="shortcuts-title" className="dialog-title">
          Keyboard shortcuts
        </h2>
        <IconButton label="Close" onClick={onClose}>
          <X size={18} />
        </IconButton>
      </div>
      <ul className="shortcut-list">
        {SHORTCUTS.map(([key, label]) => (
          <li key={key}>
            <span>{label}</span>
            <kbd>{key}</kbd>
          </li>
        ))}
      </ul>
    </dialog>
  );
}
