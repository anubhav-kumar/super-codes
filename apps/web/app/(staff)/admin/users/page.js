'use client';

import { useEffect, useState } from 'react';
import { useUser } from '../../../../components/UserContext.js';
import { api, errorText } from '../../../../lib/client-api.js';
import { PASSWORD_MIN_LENGTH } from '../../../../lib/constants.js';

const EMPTY_FORM = { name: '', email: '', role: 'agent', password: '' };

export default function UsersPage() {
  const user = useUser();
  const [users, setUsers] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState(null);
  const [created, setCreated] = useState(null);

  const isAdmin = user.role === 'admin';

  useEffect(() => {
    if (!isAdmin) return;
    api
      .listUsers()
      .then((data) => setUsers(data.users))
      .catch((err) => setLoadError(errorText(err)));
  }, [isAdmin]);

  if (!isAdmin) return <p className="page-message">Only admins can manage users.</p>;

  const set = (field) => (event) => setForm((f) => ({ ...f, [field]: event.target.value }));

  const onSubmit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setFormError(null);
    setCreated(null);
    try {
      const { user: newUser } = await api.createUser(form);
      setUsers((prev) => [...(prev ?? []), newUser].sort((a, b) => a.name.localeCompare(b.name)));
      setCreated(newUser.name);
      setForm(EMPTY_FORM);
    } catch (err) {
      setFormError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page">
      <h1 className="page-title">Users</h1>

      <section className="card">
        <h2 className="section-title">Add a user</h2>
        <form className="form-grid" onSubmit={onSubmit}>
          <label className="field">
            <span>Name</span>
            <input className="input" required value={form.name} onChange={set('name')} />
          </label>
          <label className="field">
            <span>Email</span>
            <input
              className="input"
              type="email"
              required
              value={form.email}
              onChange={set('email')}
            />
          </label>
          <label className="field">
            <span>Role</span>
            <select className="input select" value={form.role} onChange={set('role')}>
              <option value="agent">Agent</option>
              <option value="admin">Admin</option>
            </select>
          </label>
          <label className="field">
            <span>Initial password</span>
            <input
              className="input"
              type="password"
              autoComplete="new-password"
              required
              minLength={PASSWORD_MIN_LENGTH}
              value={form.password}
              onChange={set('password')}
            />
          </label>
          <div className="form-actions">
            <button type="submit" className="button primary" disabled={busy}>
              {busy ? 'Adding…' : 'Add user'}
            </button>
            {formError && <span className="inline-error">{formError}</span>}
            {created && <span className="inline-success">Added {created}.</span>}
          </div>
        </form>
      </section>

      <section className="card">
        <h2 className="section-title">All users</h2>
        {loadError && <p className="inline-error">{loadError}</p>}
        {!users && !loadError && <p className="muted">Loading…</p>}
        {users && (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.userId}>
                    <td>{u.name}</td>
                    <td>{u.email}</td>
                    <td>
                      <span className="badge">{u.role}</span>
                    </td>
                    <td>{u.active ? 'Active' : 'Inactive'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
