'use client';

import { LoaderCircle, Shuffle, UserRound } from 'lucide-react';
import { useState } from 'react';
import { UNASSIGNED } from '../lib/constants.js';
import { api, errorText } from '../lib/client-api.js';
import { Select } from './Dropdown.js';
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

  const onSelect = (userId) => {
    if (userId && userId !== chat.assignedTo) run(() => api.assign(chat.id, userId));
  };

  const options = (users ?? []).map((u) => ({
    value: u.userId,
    label: u.name,
    hint: u.role === 'admin' ? 'Admin' : 'Agent',
  }));

  return (
    <div className="assign">
      <Select
        id="assignee"
        label="Assigned to"
        size="sm"
        className="assign-select"
        icon={UserRound}
        value={chat.assignedTo === UNASSIGNED ? null : chat.assignedTo}
        options={options}
        placeholder={users ? 'Unassigned' : 'Loading…'}
        onChange={onSelect}
        disabled={busy || !users}
      />
      <button
        type="button"
        className="button"
        disabled={busy}
        onClick={() => run(() => api.autoAssign(chat.id))}
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
