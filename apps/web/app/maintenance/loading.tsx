import { TableSkeleton } from '../../components/skeletons/TableSkeleton';
import { AppFrame } from '../../components/app-frame';

export default function Loading() {
  return (
    <AppFrame title="Maintenance Windows">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-1.5">
            <div className="h-7 w-48 animate-pulse rounded bg-surface-elevated" />
            <div className="h-3 w-32 animate-pulse rounded bg-surface-elevated" />
          </div>
          <div className="h-9 w-44 animate-pulse rounded-lg bg-surface-elevated" />
        </div>
        {/* Active / Upcoming / Past section skeletons */}
        <div className="space-y-4">
          <div className="h-5 w-24 animate-pulse rounded bg-surface-elevated" />
          <TableSkeleton rows={2} cols={4} />
        </div>
        <div className="space-y-4">
          <div className="h-5 w-28 animate-pulse rounded bg-surface-elevated" />
          <TableSkeleton rows={3} cols={4} />
        </div>
      </div>
    </AppFrame>
  );
}
