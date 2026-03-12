import Link from 'next/link';
import { AlertTriangle } from 'lucide-react';

export default function NotFound() {
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
          <h1 className="text-5xl font-bold text-text-primary">404</h1>
          <p className="text-2xl font-semibold text-text-secondary">Page not found</p>
        </div>

        {/* Description */}
        <p className="text-text-secondary text-base">
          The page you're looking for doesn't exist or has been moved. Check the URL and try again.
        </p>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-3 justify-center pt-4">
          <Link
            href="/"
            className="px-6 py-2 bg-accent hover:bg-accent/90 text-bg rounded-lg font-medium transition-colors"
          >
            Go Home
          </Link>
          <Link
            href="/dashboard"
            className="px-6 py-2 bg-surface border border-border hover:border-accent text-text-primary rounded-lg font-medium transition-colors"
          >
            Dashboard
          </Link>
        </div>

        {/* Footer */}
        <p className="text-xs text-text-secondary pt-4 border-t border-border">
          If you think this is a mistake, please{' '}
          <a
            href="https://github.com/No749ah/PulseDock/issues"
            target="_blank"
            rel="noopener noreferrer"
            className="text-accent hover:underline"
          >
            report it
          </a>
        </p>
      </div>
    </div>
  );
}
