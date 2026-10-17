import { AppShell } from '../../components/AppShell.js';
import { UserProvider } from '../../components/UserContext.js';

// Every signed-in page: loads the current user once and renders the top bar.
export default function StaffLayout({ children }) {
  return (
    <UserProvider>
      <AppShell>{children}</AppShell>
    </UserProvider>
  );
}
