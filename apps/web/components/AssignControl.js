'use client';

import { LoaderCircle, Shuffle } from 'lucide-react';
import { useState } from 'react';
import { UNASSIGNED } from '../lib/constants.js';
import { api, errorText } from '../lib/client-api.js';
import { useToast } from './Toast.js';

// Admin only. users: active users from GET /api/users (may still be loading).
export function AssignControl({ chat, users, onAssigned }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const nameOf = (userId) => users?.find((u) => u.userId === userId)?.name ?? 'the selected user';

  const run = async (action) => {
    setBusy(true);
    try {
      const { chat: updated } = await action();
      toast.success(`Assigned to ${nameOf(updated.assignedTo)}`);
      await onAssigned();
    } catch (err) {
      if (err.status !== 401) toast.error(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const onSelect = (event) => {
    const userId = event.target.value;
    if (userId && userId !== chat.assignedTo) run(() => api.assign(chat.chatId, userId));
  };

  return (
    <div className="assign">
      <label className="sr-only" htmlFor="assignee">
        Assigned to
      </label>
      <select
        id="assignee"
        className="input select"
        value={chat.assignedTo === UNASSIGNED ? '' : chat.assignedTo}
        onChange={onSelect}
        disabled={busy || !users}
      >
        <option value="" disabled>
          {users ? 'Unassigned' : 'Loading…'}
        </option>
        {users?.map((u) => (
          <option key={u.userId} value={u.userId}>
            {u.name} ({u.role})
          </option>
        ))}
      </select>
      <button
        type="button"
        className="button"
        disabled={busy}
        onClick={() => run(() => api.autoAssign(chat.chatId))}
        title="Assign to the next agent in rotation"
      >
        {busy ? (
          <LoaderCircle className="spin" size={16} aria-hidden="true" />
        ) : (
          <Shuffle size={16} aria-hidden="true" />
        )}
        Auto-assign
      </button>
    </div>
  );
}
