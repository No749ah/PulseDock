import { AppFrame } from '../../components/app-frame';

export default function Loading() {
  return (
    <AppFrame title="Status Pages">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-1.5">
            <div className="h-7 w-36 animate-pulse rounded bg-surface-elevated" />
            <div className="h-3 w-28 animate-pulse rounded bg-surface-elevated" />
          </div>
          <div className="h-9 w-40 animate-pulse rounded-lg bg-surface-elevated" />
        </div>
        {/* Card grid skeleton */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-surface border border-border rounded-2xl p-5 space-y-3">
              <div className="h-5 w-3/4 animate-pulse rounded bg-surface-elevated" />
              <div className="h-3 w-1/2 animate-pulse rounded bg-surface-elevated" />
              <div className="flex gap-2">
                <div className="h-6 w-16 animate-pulse rounded-full bg-surface-elevated" />
                <div className="h-6 w-20 animate-pulse rounded-full bg-surface-elevated" />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <div className="h-8 w-16 animate-pulse rounded-lg bg-surface-elevated" />
                <div className="h-8 w-16 animate-pulse rounded-lg bg-surface-elevated" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </AppFrame>
  );
}
