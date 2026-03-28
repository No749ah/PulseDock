'use client';

export default function Error({ reset }: { reset: () => void }) {
  return (
    <div className="p-8 text-center">
      <p className="text-danger mb-4">Failed to load comparison page</p>
      <button onClick={reset} className="text-accent underline">
        Retry
      </button>
    </div>
  );
}
