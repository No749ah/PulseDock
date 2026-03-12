'use client';

import { useEffect } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface ErrorBoundaryProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function ErrorBoundary({ error, reset }: ErrorBoundaryProps) {
  useEffect(() => {
    // Log error to console for development
    console.error('Application error:', error);
  }, [error]);

  return (
    <div className="flex items-center justify-center min-h-screen bg-bg p-4">
      <div className="text-center space-y-6 max-w-md">
        {/* Icon */}
        <div className="flex justify-center">
          <div className="p-4 bg-surface border border-danger/30 rounded-full">
            <AlertTriangle size={48} className="text-danger" />
          </div>
        </div>

        {/* Heading */}
        <div className="space-y-2">
          <h1 className="text-4xl font-bold text-text-primary">Something went wrong</h1>
          <p className="text-text-secondary">An unexpected error occurred. We're working to fix it.</p>
        </div>

        {/* Error Details (Development Only) */}
        {process.env.NODE_ENV === 'development' && (
          <div className="bg-surface border border-danger/30 rounded-lg p-4 text-left max-h-40 overflow-y-auto">
            <p className="text-xs text-danger font-mono break-words">{error.message}</p>
            {error.digest && (
              <p className="text-xs text-text-secondary font-mono mt-2">ID: {error.digest}</p>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-3 justify-center pt-4">
          <button
            onClick={reset}
            className="px-6 py-2 bg-accent hover:bg-accent/90 text-bg rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
          >
            <RotateCcw size={18} />
            Try again
          </button>
          <a
            href="/"
            className="px-6 py-2 bg-surface border border-border hover:border-accent text-text-primary rounded-lg font-medium transition-colors"
          >
            Go Home
          </a>
        </div>

        {/* Footer */}
        <p className="text-xs text-text-secondary pt-4 border-t border-border">
          Error tracking helps us improve. Please check the console for more details.
        </p>
      </div>
    </div>
  );
}
