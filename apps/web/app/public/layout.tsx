/**
 * Bare layout for public share pages — no AppFrame, no nav, no auth providers.
 * Renders children directly inside a minimal HTML shell.
 */
import type { ReactNode } from 'react';

export default function PublicShareLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
