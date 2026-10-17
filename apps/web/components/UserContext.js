'use client';

import { LoaderCircle } from 'lucide-react';
import { createContext, useContext, useEffect, useState } from 'react';
import { api } from '../lib/client-api.js';

const UserContext = createContext(null);

// → the signed-in public User. Only usable under <UserProvider>.
export function useUser() {
  return useContext(UserContext);
}

// Loads /api/me once for every staff page; a 401 redirects to /login (see client-api).
export function UserProvider({ children }) {
  const [user, setUser] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    api
      .me()
      .then((data) => setUser(data.user))
      .catch((err) => {
        if (err.status !== 401) setFailed(true);
      });
  }, []);

  if (failed) {
    return (
      <p className="boot" role="alert">
        Could not load your account. Refresh to try again.
      </p>
    );
  }
  if (!user) {
    return (
      <div className="boot" role="status" aria-label="Loading">
        <LoaderCircle className="spin" size={28} aria-hidden="true" />
      </div>
    );
  }
  return <UserContext.Provider value={user}>{children}</UserContext.Provider>;
}
