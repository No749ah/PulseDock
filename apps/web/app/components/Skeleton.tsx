/**
 * Skeleton — Animated content-aware loading placeholders.
 *
 * Usage:
 *   <Skeleton className="h-4 w-32" />              // inline box
 *   <SkeletonCard rows={3} />                       // card with rows
 *   <MonitorListSkeleton count={5} />               // full monitor table skeleton
 *   <DashboardStatsSkeleton />                      // dashboard stat cards
 */

interface SkeletonProps {
  className?: string;
}

/** Bare shimmer block. Add sizing via className. */
export function Skeleton({ className = '' }: SkeletonProps) {
  return (
    <div
      className={`animate-pulse rounded bg-surface-elevated ${className}`}
      aria-hidden="true"
    />
  );
}

/** Generic card skeleton with N text rows */
export function SkeletonCard({ rows = 3 }: { rows?: number }) {
  return (
    <div className="rounded-2xl border border-border bg-surface p-6 space-y-3" aria-hidden="true">
      <Skeleton className="h-4 w-2/5" />
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className={`h-3 ${i === rows - 1 ? 'w-1/3' : 'w-full'}`} />
      ))}
    </div>
  );
}

/** Monitor list table skeleton */
export function MonitorListSkeleton({ count = 5 }: { count?: number }) {
  return (
    <div className="space-y-3" aria-label="Loading monitors…" role="status">
      {/* Table header */}
      <div className="flex gap-4 px-4 py-2">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="h-3 w-20" />
        <Skeleton className="h-3 w-36" />
        <Skeleton className="h-3 w-16 ml-auto" />
      </div>
      {/* Table rows */}
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-4 rounded-xl border border-border bg-surface px-4 py-4"
        >
          {/* Status dot */}
          <Skeleton className="h-2.5 w-2.5 rounded-full flex-shrink-0" />
          {/* Name */}
          <Skeleton className={`h-4 ${i % 3 === 0 ? 'w-32' : i % 3 === 1 ? 'w-44' : 'w-36'}`} />
          {/* Badge */}
          <Skeleton className="h-5 w-20 rounded-full" />
          {/* Target */}
          <Skeleton className="h-3 w-48 hidden sm:block" />
          {/* Actions */}
          <div className="flex gap-2 ml-auto">
            <Skeleton className="h-7 w-7 rounded-lg" />
            <Skeleton className="h-7 w-7 rounded-lg" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Dashboard stat cards skeleton */
export function DashboardStatsSkeleton() {
  return (
    <div className="space-y-6" aria-label="Loading dashboard…" role="status">
      {/* Stat cards row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-2xl border border-border bg-surface p-6 space-y-2">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-8 w-12" />
          </div>
        ))}
      </div>
      {/* Recent runs table */}
      <div className="rounded-2xl border border-border bg-surface p-6 space-y-3">
        <Skeleton className="h-4 w-32" />
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="h-2.5 w-2.5 rounded-full flex-shrink-0" />
            <Skeleton className={`h-3 ${i % 2 === 0 ? 'w-40' : 'w-32'}`} />
            <Skeleton className="h-3 w-16 ml-auto" />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Alert channels list skeleton */
export function AlertChannelsSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="space-y-3" aria-label="Loading alert channels…" role="status">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-4 rounded-xl border border-border bg-surface px-4 py-4"
        >
          <Skeleton className="h-8 w-8 rounded-lg flex-shrink-0" />
          <div className="flex-1 space-y-2">
            <Skeleton className={`h-4 ${i % 2 === 0 ? 'w-36' : 'w-44'}`} />
            <Skeleton className="h-3 w-24" />
          </div>
          <Skeleton className="h-7 w-16 rounded-lg" />
        </div>
      ))}
    </div>
  );
}
