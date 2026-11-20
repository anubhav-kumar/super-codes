import { createContext } from 'react';

/** { user, session, signIn({ email, password }), signOut() }. Provided by AuthProvider. */
export const AuthContext = createContext(null);
