/**
 * /offline — shown by the service worker when the user is offline
 * and no cached version of the requested page exists.
 */
import Link from 'next/link';
import type { Metadata } from 'next';
import { brand } from '../../lib/brand';

export const metadata: Metadata = {
  title: `Offline — ${brand.name}`,
};

export default function OfflinePage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-bg px-4 text-center">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-10 space-y-5">
        {/* Icon */}
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-xl bg-accent/10">
          <svg
            className="h-7 w-7 text-accent"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M5 12.55a11 11 0 0 1 14.08 0" />
            <path d="M1.42 9a16 16 0 0 1 21.16 0" />
            <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
            <circle cx="12" cy="20" r="1" fill="currentColor" />
          </svg>
        </div>

        <div className="space-y-2">
          <h1 className="text-xl font-bold tracking-tight text-text-primary">
            You&rsquo;re offline
          </h1>
          <p className="text-sm text-text-secondary leading-relaxed">
            {brand.name} couldn&rsquo;t reach the server. Check your connection —
            your monitors are still running in the background.
          </p>
        </div>

        {/* Status indicator */}
        <div className="flex items-center justify-center gap-2 text-xs text-text-muted">
          <span className="inline-block h-2 w-2 rounded-full bg-danger animate-pulse" />
          No connection detected
        </div>

        <Link
          href="/"
          className="block w-full rounded-lg bg-accent py-2.5 text-sm font-semibold text-bg hover:bg-accent-hover transition-colors text-center"
        >
          Return to Dashboard
        </Link>
      </div>
    </div>
  );
}
