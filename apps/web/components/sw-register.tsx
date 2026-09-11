'use client';

/**
 * SWRegister — registers the PulseDock service worker.
 * Runs once after mount; no-ops in non-supporting browsers.
 */

import { useEffect } from 'react';

export function SWRegister() {
  useEffect(() => {
    if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
      navigator.serviceWorker
        .register('/sw.js', { scope: '/' })
        .catch((err) => {
          // Non-fatal: app still works without SW
          console.warn('[PulseDock SW] Registration failed:', err);
        });
    }
  }, []);

  return null;
}
