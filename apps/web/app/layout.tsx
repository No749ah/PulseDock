import '@mantine/core/styles.css';
import './globals.css';
import type { ReactNode } from 'react';
import { Providers } from './providers';
import RuntimeApiProvider from './providers/RuntimeApiProvider';

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <Providers>
          <RuntimeApiProvider />
          {children}
        </Providers>
      </body>
    </html>
  );
}
