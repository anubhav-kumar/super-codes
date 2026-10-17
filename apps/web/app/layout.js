import './globals.css';
import { THEME_BOOT_SCRIPT } from '../lib/prefs.js';

export const metadata = {
  title: 'Vartalap',
  description: 'WhatsApp multi-agent chat',
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0e1a22' },
  ],
};

export default function RootLayout({ children }) {
  return (
    // The boot script may set data-theme before React hydrates.
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
