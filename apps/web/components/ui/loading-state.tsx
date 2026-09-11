'use client';

export function LoadingState({ label = 'Loading data...' }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 gap-3">
      <div className="animate-spin rounded-full h-8 w-8 border-2 border-accent border-t-transparent" />
      <p className="text-sm text-text-secondary">{label}</p>
    </div>
  );
}
