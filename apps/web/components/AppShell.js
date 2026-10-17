'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { api } from '../lib/client-api.js';
import { useUser } from './UserContext.js';

async function logout() {
  try {
    await api.logout();
  } finally {
    window.location.assign('/login');
  }
}

export function AppShell({ children }) {
  const user = useUser();
  const pathname = usePathname();
  const navClass = (prefix) => (pathname.startsWith(prefix) ? 'nav-link active' : 'nav-link');

  return (
    <div className="shell">
      <header className="topbar">
        <Link href="/chats" className="brand">
          Vartalap
        </Link>
        <nav className="nav">
          <Link href="/chats" className={navClass('/chats')}>
            Chats
          </Link>
          {user.role === 'admin' && (
            <Link href="/admin/users" className={navClass('/admin')}>
              Users
            </Link>
          )}
          <Link href="/account/password" className={navClass('/account')}>
            Password
          </Link>
        </nav>
        <div className="whoami">
          <span className="whoami-name">{user.name}</span>
          <span className="badge">{user.role}</span>
          <button type="button" className="button ghost" onClick={logout}>
            Log out
          </button>
        </div>
      </header>
      <main className="shell-main">{children}</main>
    </div>
  );
}
