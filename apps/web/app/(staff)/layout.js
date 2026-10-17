import { AppShell } from '../../components/AppShell.js';
import { ToastProvider } from '../../components/Toast.js';
import { UserProvider } from '../../components/UserContext.js';

// Every signed-in page: loads the current user once, renders the top bar and the toast region.
export default function StaffLayout({ children }) {
  return (
    <ToastProvider>
      <UserProvider>
        <AppShell>{children}</AppShell>
      </UserProvider>
    </ToastProvider>
  );
}
