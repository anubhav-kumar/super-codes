export const metadata = {
  title: 'Vartalap',
  description: 'WhatsApp multi-agent chat',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
