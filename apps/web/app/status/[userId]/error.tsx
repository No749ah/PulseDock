'use client';

export default function StatusError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-bg px-4 text-center">
      <div className="rounded-2xl border border-border bg-surface p-10 shadow-xl shadow-black/30 max-w-md w-full">
        <div className="text-4xl">⚠️</div>
        <h1 className="mt-4 text-xl font-semibold text-text-primary">Failed to load status page</h1>
        <p className="mt-2 text-sm text-text-secondary">{error.message || 'An unexpected error occurred.'}</p>
        <button
          onClick={reset}
          className="mt-6 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent/90 transition-colors"
        >
          Try again
        </button>
      </div>
    </main>
  );
}
