import { TableSkeleton } from '../../components/skeletons/TableSkeleton';
import { AppFrame } from '../../components/app-frame';

function StatCardSkeleton() {
  return (
    <div className="rounded-2xl border border-border bg-surface p-6 space-y-3">
      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <div className="h-3 w-20 animate-pulse rounded bg-surface-elevated" />
          <div className="h-8 w-14 animate-pulse rounded bg-surface-elevated" />
        </div>
        <div className="h-12 w-12 animate-pulse rounded-xl bg-surface-elevated" />
      </div>
    </div>
  );
}

export default function Loading() {
  return (
    <AppFrame title="Dashboard">
      <div className="space-y-8">
        {/* Heading skeleton */}
        <div className="h-7 w-40 animate-pulse rounded bg-surface-elevated" />

        {/* 4 stat card skeletons */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <StatCardSkeleton />
          <StatCardSkeleton />
          <StatCardSkeleton />
          <StatCardSkeleton />
        </div>

        {/* Below-fold: monitors table skeleton */}
        <div className="space-y-3">
          <div className="h-5 w-28 animate-pulse rounded bg-surface-elevated" />
          <TableSkeleton rows={4} cols={5} />
        </div>

        {/* Recent activity skeleton */}
        <div className="space-y-3">
          <div className="h-5 w-36 animate-pulse rounded bg-surface-elevated" />
          <TableSkeleton rows={3} cols={3} />
        </div>
      </div>
    </AppFrame>
  );
}
