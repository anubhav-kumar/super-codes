'use client';

import { usePathname } from 'next/navigation';
import { ChatList } from '../../../components/ChatList.js';

// Two panes: chat list + open conversation. On narrow screens only one shows at a time.
export default function ChatsLayout({ children }) {
  const hasChat = usePathname() !== '/chats';
  return (
    <div className={hasChat ? 'chats-layout has-chat' : 'chats-layout'}>
      <ChatList />
      <section className="chat-pane">{children}</section>
    </div>
  );
}
