'use client';

import { CircleAlert, LoaderCircle } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { PasswordInput } from '../../components/PasswordInput.js';
import { BrandMark } from '../../components/ui.js';
import { api, errorText, safeNext } from '../../lib/client-api.js';

function LoginForm() {
  const nextParam = useSearchParams().get('next');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.login(email, password);
      window.location.assign(safeNext(nextParam));
    } catch (err) {
      setError(errorText(err));
      setBusy(false);
    }
  };

  return (
    <form className="card auth-card" onSubmit={onSubmit} noValidate={false}>
      <div className="auth-brand">
        <BrandMark large />
        <div>
          <h1 className="auth-title">Vartalap</h1>
          <p className="auth-subtitle">Sign in to your team inbox</p>
        </div>
      </div>

      {error && (
        <p className="alert danger" role="alert">
          <CircleAlert size={16} aria-hidden="true" />
          {error}
        </p>
      )}

      <div className="field">
        <label className="field-label" htmlFor="email">
          Email
        </label>
        <input
          id="email"
          className="input"
          type="email"
          autoComplete="username"
          autoFocus
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <div className="field">
        <label className="field-label" htmlFor="password">
          Password
        </label>
        <PasswordInput
          id="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>

      <button type="submit" className="button primary block" disabled={busy}>
        {busy && <LoaderCircle className="spin" size={18} aria-hidden="true" />}
        {busy ? 'Signing in…' : 'Sign in'}
      </button>
      <p className="auth-footer">Ask an admin if you need an account or a password reset.</p>
    </form>
  );
}

export default function LoginPage() {
  return (
    <main className="auth-page">
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </main>
  );
}
