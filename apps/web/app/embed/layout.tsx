// Embed layout — intentionally bare, no AppFrame, no nav, no sidebar.
// Pages under /embed/ are served in iframes on external sites.
import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';

const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  display: 'swap',
  variable: '--font-inter',
});

export const metadata: Metadata = {
  robots: 'noindex, nofollow',
};

export default function EmbedLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="robots" content="noindex, nofollow" />
      </head>
      <body style={{ margin: 0, padding: 0, fontFamily: 'var(--font-inter, Inter, system-ui, sans-serif)' }}>
        {children}
      </body>
    </html>
  );
}
