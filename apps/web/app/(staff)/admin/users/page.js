'use client';

import { CircleAlert, LoaderCircle, ShieldCheck, UserPlus, Users } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Select } from '../../../../components/Dropdown.js';
import { PasswordInput } from '../../../../components/PasswordInput.js';
import { useToast } from '../../../../components/Toast.js';
import { Avatar, EmptyState, Skeleton } from '../../../../components/ui.js';
import { useUser } from '../../../../components/UserContext.js';
import { api, errorText } from '../../../../lib/client-api.js';
import { PASSWORD_MIN_LENGTH } from '../../../../lib/constants.js';

const EMPTY_FORM = { name: '', email: '', role: 'agent', password: '' };
const ROLE_OPTIONS = [
  { value: 'agent', label: 'Agent', hint: 'Sees only chats assigned to them' },
  { value: 'admin', label: 'Admin', hint: 'Sees every chat and manages users' },
];

function UsersTableSkeleton() {
  return (
    <tbody aria-hidden="true">
      {Array.from({ length: 4 }, (_, i) => (
        <tr key={i}>
          <td>
            <div className="user-cell">
              <Skeleton circle width={32} height={32} />
              <Skeleton width={120} height={12} />
            </div>
          </td>
          <td>
            <Skeleton width={180} height={12} />
          </td>
          <td>
            <Skeleton width={56} height={18} />
          </td>
          <td>
            <Skeleton width={56} height={18} />
          </td>
        </tr>
      ))}
    </tbody>
  );
}

export default function UsersPage() {
  const user = useUser();
  const toast = useToast();
  const [users, setUsers] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState(null);

  const isAdmin = user.role === 'admin';

  useEffect(() => {
    if (!isAdmin) return;
    api
      .listUsers()
      .then((data) => setUsers(data.users))
      .catch((err) => setLoadError(errorText(err)));
  }, [isAdmin]);

  if (!isAdmin) {
    return (
      <div className="page">
        <EmptyState icon={ShieldCheck} title="Admins only">
          Only admins can manage users.
        </EmptyState>
      </div>
    );
  }

  const set = (field) => (event) => setForm((f) => ({ ...f, [field]: event.target.value }));

  const onSubmit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setFormError(null);
    try {
      const { user: newUser } = await api.createUser(form);
      setUsers((prev) => [...(prev ?? []), newUser].sort((a, b) => a.name.localeCompare(b.name)));
      toast.success(`Added ${newUser.name} as ${newUser.role}`);
      setForm(EMPTY_FORM);
    } catch (err) {
      setFormError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page">
      <header className="page-header">
        <h1 className="page-title">Users</h1>
        <p className="page-subtitle">Admins and agents who can sign in to this inbox.</p>
      </header>

      <section className="card" aria-labelledby="add-user">
        <h2 className="section-title" id="add-user">
          <UserPlus size={18} aria-hidden="true" />
          Add a user
        </h2>
        <form className="form-grid" onSubmit={onSubmit}>
          <div className="field">
            <label className="field-label" htmlFor="new-name">
              Name
            </label>
            <input
              id="new-name"
              className="input"
              required
              value={form.name}
              onChange={set('name')}
            />
          </div>
          <div className="field">
            <label className="field-label" htmlFor="new-email">
              Email
            </label>
            <input
              id="new-email"
              className="input"
              type="email"
              required
              value={form.email}
              onChange={set('email')}
            />
          </div>
          <div className="field">
            <label className="field-label" htmlFor="new-role">
              Role
            </label>
            <Select
              id="new-role"
              value={form.role}
              options={ROLE_OPTIONS}
              onChange={(role) => setForm((f) => ({ ...f, role }))}
            />
          </div>
          <div className="field">
            <label className="field-label" htmlFor="new-password">
              Initial password
            </label>
            <PasswordInput
              id="new-password"
              autoComplete="new-password"
              required
              minLength={PASSWORD_MIN_LENGTH}
              value={form.password}
              onChange={set('password')}
            />
            <span className="field-hint">At least {PASSWORD_MIN_LENGTH} characters.</span>
          </div>
          <div className="form-actions">
            <button type="submit" className="button primary" disabled={busy}>
              {busy ? (
                <LoaderCircle className="spin" size={16} aria-hidden="true" />
              ) : (
                <UserPlus size={16} aria-hidden="true" />
              )}
              {busy ? 'Adding…' : 'Add user'}
            </button>
            {formError && (
              <span className="inline-error" role="alert">
                {formError}
              </span>
            )}
          </div>
        </form>
      </section>

      <section className="card" aria-labelledby="all-users">
        <h2 className="section-title" id="all-users">
          <Users size={18} aria-hidden="true" />
          All users
          {users && <span className="count-pill">{users.length}</span>}
        </h2>
        {loadError && (
          <p className="alert danger" role="alert">
            <CircleAlert size={16} aria-hidden="true" />
            {loadError}
          </p>
        )}
        {!loadError && (
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col">Email</th>
                  <th scope="col">Role</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              {!users && <UsersTableSkeleton />}
              {users && (
                <tbody>
                  {users.map((u) => (
                    <tr key={u.userId}>
                      <td>
                        <div className="user-cell">
                          <Avatar name={u.name} id={u.userId} size="sm" />
                          {u.name}
                        </div>
                      </td>
                      <td>{u.email}</td>
                      <td>
                        <span
                          className={
                            u.role === 'admin' ? 'badge accent capitalize' : 'badge capitalize'
                          }
                        >
                          {u.role}
                        </span>
                      </td>
                      <td>
                        <span className={u.active ? 'badge success' : 'badge'}>
                          {u.active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              )}
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
