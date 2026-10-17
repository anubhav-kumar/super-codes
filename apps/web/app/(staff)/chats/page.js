'use client';

import { MessagesSquare } from 'lucide-react';
import { EmptyState } from '../../../components/ui.js';

export default function ChatsIndexPage() {
  return (
    <div className="conversation empty">
      <EmptyState icon={MessagesSquare} title="Pick a conversation">
        Choose a chat from the list. Press <kbd>J</kbd> / <kbd>K</kbd> to move between chats or{' '}
        <kbd>?</kbd> for all shortcuts.
      </EmptyState>
    </div>
  );
}
