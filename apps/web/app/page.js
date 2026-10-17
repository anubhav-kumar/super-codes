import { redirect } from 'next/navigation';

// Signed-out visitors never get here: proxy.js sends them to /login first.
export default function HomePage() {
  redirect('/chats');
}
