'use client';

import { useState } from 'react';
import { UNASSIGNED } from '../lib/constants.js';
import { api, errorText } from '../lib/client-api.js';

// Admin only. users: active users from GET /api/users (may still be loading).
export function AssignControl({ chat, users, onAssigned }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const run = async (action) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      await onAssigned();
    } catch (err) {
      if (err.status !== 401) setError(errorText(err));
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
      <label className="assign-label" htmlFor="assignee">
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
      >
        Auto-assign
      </button>
      {error && <span className="inline-error">{error}</span>}
    </div>
  );
}
