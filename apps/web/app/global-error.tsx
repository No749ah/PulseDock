'use client';

import { AlertTriangle, RotateCcw } from 'lucide-react';

interface GlobalErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function GlobalError({ error, reset }: GlobalErrorProps) {
  return (
    <html lang="en">
      <body className="min-h-screen flex items-center justify-center bg-[#0a0a0f] p-4">
        <div className="text-center space-y-6 max-w-md">
          {/* Icon */}
          <div className="flex justify-center">
            <div className="p-4 bg-[#1a1a2e] border border-red-500/30 rounded-full">
              <AlertTriangle size={48} className="text-red-400" />
            </div>
          </div>

          {/* Heading */}
          <div className="space-y-2">
            <h1 className="text-4xl font-bold text-white">Something went wrong</h1>
            <p className="text-gray-400">A critical error occurred. Please try again.</p>
          </div>

          {/* Error Details (Development Only) */}
          {process.env.NODE_ENV === 'development' && (
            <div className="bg-[#1a1a2e] border border-red-500/30 rounded-lg p-4 text-left max-h-40 overflow-y-auto">
              <p className="text-xs text-red-400 font-mono break-words">{error.message}</p>
              {error.digest && (
                <p className="text-xs text-gray-500 font-mono mt-2">ID: {error.digest}</p>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-col sm:flex-row gap-3 justify-center pt-4">
            <button
              onClick={reset}
              className="px-6 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
            >
              <RotateCcw size={18} />
              Try again
            </button>
            <a
              href="/"
              className="px-6 py-2 bg-[#1a1a2e] border border-gray-700 hover:border-indigo-500 text-gray-200 rounded-lg font-medium transition-colors"
            >
              Go Home
            </a>
          </div>

          <p className="text-xs text-gray-600 pt-4 border-t border-gray-800">
            PulseDock — Global Error Recovery
          </p>
        </div>
      </body>
    </html>
  );
}
