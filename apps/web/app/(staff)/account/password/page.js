'use client';

import { useState } from 'react';
import { api, errorText } from '../../../../lib/client-api.js';
import { PASSWORD_MAX_BYTES, PASSWORD_MIN_LENGTH } from '../../../../lib/constants.js';

function passwordProblem(password, confirm) {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `New password must be at least ${PASSWORD_MIN_LENGTH} characters.`;
  }
  if (new TextEncoder().encode(password).length > PASSWORD_MAX_BYTES) {
    return 'New password is too long.';
  }
  if (password !== confirm) return 'The new passwords do not match.';
  return null;
}

export default function PasswordPage() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(false);

  const onSubmit = async (event) => {
    event.preventDefault();
    setDone(false);
    const problem = passwordProblem(next, confirm);
    if (problem) return setError(problem);

    setBusy(true);
    setError(null);
    try {
      await api.changePassword(current, next);
      setDone(true);
      setCurrent('');
      setNext('');
      setConfirm('');
    } catch (err) {
      setError(err.status === 401 ? 'Current password is incorrect.' : errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page narrow">
      <h1 className="page-title">Change password</h1>
      <form className="card" onSubmit={onSubmit}>
        <label className="field">
          <span>Current password</span>
          <input
            className="input"
            type="password"
            autoComplete="current-password"
            required
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
          />
        </label>
        <label className="field">
          <span>New password</span>
          <input
            className="input"
            type="password"
            autoComplete="new-password"
            required
            value={next}
            onChange={(e) => setNext(e.target.value)}
          />
        </label>
        <label className="field">
          <span>Confirm new password</span>
          <input
            className="input"
            type="password"
            autoComplete="new-password"
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </label>
        {error && <p className="inline-error">{error}</p>}
        {done && (
          <p className="inline-success">
            Password changed. Other signed-in sessions have been signed out.
          </p>
        )}
        <button type="submit" className="button primary" disabled={busy}>
          {busy ? 'Saving…' : 'Change password'}
        </button>
      </form>
    </div>
  );
}
