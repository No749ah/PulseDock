import { AppFrame } from '../../../components/app-frame';

export default function Loading() {
  return (
    <AppFrame title="Loading...">
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <div className="h-7 w-40 animate-pulse rounded bg-surface-elevated" />
            <div className="h-4 w-56 animate-pulse rounded bg-surface-elevated" />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-surface border border-border rounded-2xl p-5 space-y-3">
              <div className="h-5 w-2/3 animate-pulse rounded bg-surface-elevated" />
              <div className="h-4 w-1/2 animate-pulse rounded bg-surface-elevated" />
              <div className="h-4 w-3/4 animate-pulse rounded bg-surface-elevated" />
            </div>
          ))}
        </div>
      </div>
    </AppFrame>
  );
}

