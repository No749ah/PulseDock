'use client';

import { MantineProvider, createTheme } from '@mantine/core';
import type { ReactNode } from 'react';

const theme = createTheme({
  primaryColor: 'teal',
  defaultRadius: 'md',
  fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial',
  headings: { fontFamily: 'Inter, ui-sans-serif, system-ui' },
});

export function Providers({ children }: { children: ReactNode }) {
  return (
    <MantineProvider theme={theme} forceColorScheme="dark">
      {children}
    </MantineProvider>
  );
}
