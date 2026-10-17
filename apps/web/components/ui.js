'use client';

// Small shared UI pieces (F1). Icons come from lucide-react, imported one by one.
import { MessageCircle, UserRound } from 'lucide-react';
import { forwardRef } from 'react';
import { colorSlot, initials } from '../lib/format.js';

const AVATAR_ICON = { sm: 16, md: 20, lg: 32 };

// Initials on a stable colour; a person icon when the name has no letters (never digits).
export function Avatar({ name, id, size = 'md' }) {
  const text = initials(name);
  return (
    <span className={`avatar size-${size} c${colorSlot(id ?? name)}`} aria-hidden="true">
      {text ?? <UserRound size={AVATAR_ICON[size]} />}
    </span>
  );
}

// Icon-only button with an accessible name (label) and a tooltip.
export const IconButton = forwardRef(function IconButton(
  { label, children, className = '', ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      className={`icon-button ${className}`}
      aria-label={label}
      title={label}
      {...props}
    >
      {children}
    </button>
  );
});

export function BrandMark({ large = false }) {
  return (
    <span className={large ? 'brand-mark lg' : 'brand-mark'} aria-hidden="true">
      <MessageCircle size={large ? 24 : 18} strokeWidth={2.4} />
    </span>
  );
}

export function EmptyState({ icon: Icon, title, children }) {
  return (
    <div className="empty-state">
      {Icon && (
        <span className="empty-state-icon" aria-hidden="true">
          <Icon size={26} />
        </span>
      )}
      <p className="empty-state-title">{title}</p>
      {children && <p className="empty-state-text">{children}</p>}
    </div>
  );
}

export function Skeleton({ width = '100%', height = 12, circle = false }) {
  return (
    <span
      className={circle ? 'skeleton circle' : 'skeleton'}
      style={{ width, height }}
      aria-hidden="true"
    />
  );
}

export function ChatListSkeleton({ rows = 8 }) {
  return (
    <div role="status" aria-label="Loading chats">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="skeleton-row">
          <Skeleton circle width={42} height={42} />
          <div className="skeleton-lines">
            <Skeleton width={`${55 + ((i * 13) % 30)}%`} height={13} />
            <Skeleton width={`${70 + ((i * 7) % 25)}%`} height={11} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function MessagesSkeleton() {
  const widths = ['46%', '34%', '58%', '28%', '50%'];
  return (
    <div className="messages-skeleton" role="status" aria-label="Loading messages">
      {widths.map((w, i) => (
        <Skeleton key={i} width={w} height={i % 2 ? 44 : 56} />
      ))}
    </div>
  );
}
