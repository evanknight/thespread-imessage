import type { ReactNode } from 'react';

export const metadata = { title: 'The Spread' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, background: '#0d1117', color: '#e6edf3', fontFamily: 'ui-sans-serif, -apple-system, system-ui' }}>
        {children}
      </body>
    </html>
  );
}
