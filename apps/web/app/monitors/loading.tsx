import { TableSkeleton } from '../../components/skeletons/TableSkeleton';
import { AppFrame } from '../../components/app-frame';

export default function Loading() {
  return (
    <AppFrame title="Uptime Checks">
      <div className="space-y-6">
        {/* Header skeleton */}
        <div className="flex items-center justify-between">
          <div className="space-y-1.5">
            <div className="h-7 w-40 animate-pulse rounded bg-surface-elevated" />
            <div className="h-3 w-28 animate-pulse rounded bg-surface-elevated" />
          </div>
          <div className="h-9 w-36 animate-pulse rounded-lg bg-surface-elevated" />
        </div>
        {/* Search / filter bar skeleton */}
        <div className="flex items-center gap-3">
          <div className="h-9 flex-1 animate-pulse rounded-lg bg-surface-elevated" />
          <div className="h-9 w-32 animate-pulse rounded-lg bg-surface-elevated" />
          <div className="h-9 w-20 animate-pulse rounded-lg bg-surface-elevated" />
        </div>
        {/* Monitor table skeleton — 5 rows, 5 cols */}
        <TableSkeleton rows={5} cols={5} />
      </div>
    </AppFrame>
  );
}
