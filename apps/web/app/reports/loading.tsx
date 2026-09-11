import { AppFrame } from '../../components/app-frame';

export default function Loading() {
  return (
    <AppFrame title="Reports">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-1.5">
            <div className="h-7 w-28 animate-pulse rounded bg-surface-elevated" />
            <div className="h-3 w-40 animate-pulse rounded bg-surface-elevated" />
          </div>
          <div className="h-9 w-36 animate-pulse rounded-lg bg-surface-elevated" />
        </div>
        {/* Report cards skeleton */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-surface border border-border rounded-2xl p-5 space-y-3">
              <div className="h-5 w-2/3 animate-pulse rounded bg-surface-elevated" />
              <div className="h-3 w-1/2 animate-pulse rounded bg-surface-elevated" />
              <div className="h-3 w-3/4 animate-pulse rounded bg-surface-elevated" />
            </div>
          ))}
        </div>
      </div>
    </AppFrame>
  );
}
