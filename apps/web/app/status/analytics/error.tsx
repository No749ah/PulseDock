'use client';

import { AlertTriangle, RotateCcw } from 'lucide-react';

interface PageErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function PageError({ error, reset }: PageErrorProps) {
  return (
    <div className="flex items-center justify-center min-h-[400px] p-8">
      <div className="text-center space-y-4 max-w-sm">
        <div className="flex justify-center">
          <div className="p-3 bg-surface border border-danger/30 rounded-full">
            <AlertTriangle size={32} className="text-danger" />
          </div>
        </div>
        <div className="space-y-1">
          <h2 className="text-xl font-semibold text-text-primary">Page error</h2>
          <p className="text-sm text-text-secondary">Something went wrong loading Status Analytics.</p>
        </div>
        {process.env.NODE_ENV === 'development' && (
          <div className="bg-surface-elevated border border-danger/20 rounded-xl p-3 text-left max-h-32 overflow-y-auto">
            <p className="text-xs text-danger font-mono break-words">{error.message}</p>
            {error.digest && (
              <p className="text-xs text-text-secondary font-mono mt-1">ID: {error.digest}</p>
            )}
          </div>
        )}
        <button
          onClick={reset}
          className="inline-flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-hover text-bg rounded-xl text-sm font-semibold transition-all active:scale-[0.97]"
        >
          <RotateCcw size={14} />
          Retry
        </button>
      </div>
    </div>
  );
}

