'use client';

export default function ActivityError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
      <p className="text-text-secondary">Failed to load activity feed.</p>
      <button onClick={reset} className="text-sm text-accent hover:underline">Try again</button>
    </div>
  );
}
