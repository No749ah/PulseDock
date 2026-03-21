'use client';

import { AlertTriangle, RotateCcw } from 'lucide-react';
import { brand } from '../lib/brand';

interface GlobalErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function GlobalError({ error, reset }: GlobalErrorProps) {
  return (
    <html lang="en">
      <body className="min-h-screen flex items-center justify-center bg-bg p-4">
        <div className="text-center space-y-6 max-w-md">
          {/* Icon */}
          <div className="flex justify-center">
            <div className="p-4 bg-danger/10 border border-danger/30 rounded-full">
              <AlertTriangle size={48} className="text-danger" />
            </div>
          </div>

          {/* Heading */}
          <div className="space-y-2">
            <h1 className="text-4xl font-bold text-text-primary">Something went wrong</h1>
            <p className="text-text-secondary">A critical error occurred. Please try again.</p>
          </div>

          {/* Error Details (Development Only) */}
          {process.env.NODE_ENV === 'development' && (
            <div className="bg-surface-elevated border border-danger/30 rounded-xl p-4 text-left max-h-40 overflow-y-auto">
              <p className="text-xs text-danger font-mono break-words">{error.message}</p>
              {error.digest && (
                <p className="text-xs text-text-muted font-mono mt-2">ID: {error.digest}</p>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-col sm:flex-row gap-3 justify-center pt-4">
            <button
              onClick={reset}
              className="px-6 py-2 bg-accent hover:bg-accent-hover text-bg rounded-xl font-semibold transition-all active:scale-[0.97] flex items-center justify-center gap-2"
            >
              <RotateCcw size={18} />
              Try again
            </button>
            <a
              href="/"
              className="px-6 py-2 bg-surface border border-border hover:border-border-hover text-text-primary rounded-xl font-semibold transition-all"
            >
              Go Home
            </a>
          </div>

          <p className="text-xs text-text-muted pt-4 border-t border-border">
            {brand.name} — Global Error Recovery
          </p>
        </div>
      </body>
    </html>
  );
}
