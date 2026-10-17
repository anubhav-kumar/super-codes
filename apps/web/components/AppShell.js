'use client';

import {
  ChevronDown,
  KeyRound,
  Keyboard,
  LogOut,
  MessageSquare,
  Monitor,
  Moon,
  Sun,
  Users,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/client-api.js';
import { THEMES, applyTheme, readPref, writePref } from '../lib/prefs.js';
import { useShortcuts } from '../lib/use-shortcuts.js';
import { ShortcutsDialog } from './ShortcutsDialog.js';
import { Avatar, BrandMark } from './ui.js';
import { useUser } from './UserContext.js';

const THEME_OPTIONS = { system: ['System', Monitor], light: ['Light', Sun], dark: ['Dark', Moon] };

async function logout() {
  try {
    await api.logout();
  } finally {
    window.location.assign('/login');
  }
}

function UserMenu({ onShowShortcuts }) {
  const user = useUser();
  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState('system');
  const rootRef = useRef(null);
  const triggerRef = useRef(null);

  useEffect(() => setTheme(readPref('theme', 'system')), []);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    const onKey = (event) => {
      if (event.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const chooseTheme = (next) => {
    setTheme(next);
    writePref('theme', next);
    applyTheme(next);
  };

  return (
    <div className="user-menu" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className="user-menu-trigger"
        aria-haspopup="true"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <Avatar name={user.name} id={user.userId} size="sm" />
        <span className="user-menu-name">{user.name}</span>
        <ChevronDown size={16} aria-hidden="true" />
      </button>

      {open && (
        <div className="user-menu-panel">
          <div className="user-menu-head">
            <Avatar name={user.name} id={user.userId} size="md" />
            <div className="user-menu-who">
              <strong>{user.name}</strong>
              <span className="muted small">{user.email}</span>
            </div>
            <span className="badge accent capitalize">{user.role}</span>
          </div>

          <div className="user-menu-section">
            <p className="menu-label" id="theme-label">
              Theme
            </p>
            <div className="segmented" role="group" aria-labelledby="theme-label">
              {THEMES.map((value) => {
                const [label, Icon] = THEME_OPTIONS[value];
                return (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={theme === value}
                    onClick={() => chooseTheme(value)}
                  >
                    <Icon size={14} aria-hidden="true" />
                    {label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="user-menu-section">
            <Link href="/account/password" className="menu-item" onClick={() => setOpen(false)}>
              <KeyRound size={16} aria-hidden="true" />
              Change password
            </Link>
            <button
              type="button"
              className="menu-item"
              onClick={() => {
                setOpen(false);
                onShowShortcuts();
              }}
            >
              <Keyboard size={16} aria-hidden="true" />
              Keyboard shortcuts
            </button>
            <button type="button" className="menu-item" onClick={logout}>
              <LogOut size={16} aria-hidden="true" />
              Log out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function AppShell({ children }) {
  const user = useUser();
  const pathname = usePathname();
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const navClass = (prefix) => (pathname.startsWith(prefix) ? 'nav-link active' : 'nav-link');

  useShortcuts({ '?': () => setShortcutsOpen(true) });

  return (
    <div className="shell">
      <header className="topbar">
        <Link href="/chats" className="brand">
          <BrandMark />
          <span className="brand-word">Vartalap</span>
        </Link>
        <nav className="nav" aria-label="Main">
          <Link href="/chats" className={navClass('/chats')}>
            <MessageSquare size={18} aria-hidden="true" />
            <span className="nav-link-label">Chats</span>
          </Link>
          {user.role === 'admin' && (
            <Link href="/admin/users" className={navClass('/admin')}>
              <Users size={18} aria-hidden="true" />
              <span className="nav-link-label">Users</span>
            </Link>
          )}
        </nav>
        <UserMenu onShowShortcuts={() => setShortcutsOpen(true)} />
      </header>
      <main className="shell-main">{children}</main>
      <ShortcutsDialog open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
    </div>
  );
}
