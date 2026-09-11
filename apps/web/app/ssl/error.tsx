'use client';

export default function SslError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
      <p className="text-text-secondary">Failed to load SSL inventory.</p>
      <button onClick={reset} className="px-4 py-2 rounded-lg bg-accent text-white text-sm hover:bg-accent/90 transition-colors">
        Try again
      </button>
    </div>
  );
}
