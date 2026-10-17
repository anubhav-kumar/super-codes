'use client';

import { CircleAlert, CircleCheck, KeyRound, LoaderCircle } from 'lucide-react';
import { useState } from 'react';
import { PasswordInput } from '../../../../components/PasswordInput.js';
import { useToast } from '../../../../components/Toast.js';
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
  const toast = useToast();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(false);

  const longEnough = next.length >= PASSWORD_MIN_LENGTH;

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
      toast.success('Password changed');
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
      <header className="page-header">
        <h1 className="page-title">Change password</h1>
        <p className="page-subtitle">Changing it signs you out everywhere else.</p>
      </header>
      <form className="card" onSubmit={onSubmit}>
        {error && (
          <p className="alert danger" role="alert" style={{ marginBottom: 'var(--space-4)' }}>
            <CircleAlert size={16} aria-hidden="true" />
            {error}
          </p>
        )}
        {done && (
          <p className="alert success" role="status" style={{ marginBottom: 'var(--space-4)' }}>
            <CircleCheck size={16} aria-hidden="true" />
            Password changed. Other signed-in sessions have been signed out.
          </p>
        )}
        <div className="field">
          <label className="field-label" htmlFor="current-password">
            Current password
          </label>
          <PasswordInput
            id="current-password"
            autoComplete="current-password"
            required
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
          />
        </div>
        <div className="field">
          <label className="field-label" htmlFor="new-password">
            New password
          </label>
          <PasswordInput
            id="new-password"
            autoComplete="new-password"
            required
            aria-describedby="new-password-hint"
            value={next}
            onChange={(e) => setNext(e.target.value)}
          />
          <span
            id="new-password-hint"
            className="field-hint"
            style={longEnough ? { color: 'var(--success)' } : undefined}
          >
            {longEnough ? '✓ ' : ''}At least {PASSWORD_MIN_LENGTH} characters
          </span>
        </div>
        <div className="field">
          <label className="field-label" htmlFor="confirm-password">
            Confirm new password
          </label>
          <PasswordInput
            id="confirm-password"
            autoComplete="new-password"
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </div>
        <button type="submit" className="button primary block" disabled={busy}>
          {busy ? (
            <LoaderCircle className="spin" size={18} aria-hidden="true" />
          ) : (
            <KeyRound size={18} aria-hidden="true" />
          )}
          {busy ? 'Saving…' : 'Change password'}
        </button>
      </form>
    </div>
  );
}
