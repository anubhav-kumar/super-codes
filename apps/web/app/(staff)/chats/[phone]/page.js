'use client';

import { useParams } from 'next/navigation';
import { Conversation } from '../../../../components/Conversation.js';

function decode(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export default function ChatPage() {
  const chatId = decode(String(useParams().phone ?? ''));
  // key: switching chats starts from a clean state (no stale messages or in-flight polls).
  return <Conversation key={chatId} chatId={chatId} />;
}
