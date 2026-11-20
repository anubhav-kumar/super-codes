import { useContext } from 'react';
import { AuthContext } from '../auth/AuthContext.js';

/** { user, session, signIn({ email, password }), signOut() } */
export default function useAuth() {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
    return ctx;
}
