'use client';

import { Lock } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { Conversation } from '../../../../components/Conversation.js';
import { EmptyState } from '../../../../components/ui.js';

// Same format as core's PUBLIC_ID_REGEX (core is not imported into the browser bundle).
const PUBLIC_ID_REGEX = /^c_[0-9A-HJKMNP-TV-Z]{26}$/;

function decode(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

// F3: [id] is the chat's opaque publicId; the phone number never appears in the URL.
// Anything else (e.g. an old /chats/+65… bookmark) is rejected here without an API call,
// and is never redirected (D8): a redirect would let anyone confirm a number.
export default function ChatPage() {
  const id = decode(String(useParams().id ?? ''));
  if (!PUBLIC_ID_REGEX.test(id)) {
    return (
      <div className="conversation empty">
        <EmptyState icon={Lock} title="No access">
          That is not a valid chat address.
        </EmptyState>
        <Link href="/chats" className="button">
          Back to chats
        </Link>
      </div>
    );
  }
  // key: switching chats starts from a clean state (no stale messages or in-flight polls).
  return <Conversation key={id} id={id} />;
}
