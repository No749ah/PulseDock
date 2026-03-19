/**
 * TableSkeleton — Generic animate-pulse table skeleton.
 * Pure server component, no "use client" needed.
 *
 * Props:
 *   rows - number of skeleton rows (default 5)
 *   cols - number of columns per row (default 4)
 */

interface TableSkeletonProps {
  rows?: number;
  cols?: number;
}

/** Widths cycled per column index to add visual variety */
const COL_WIDTHS = ["w-32", "w-20", "w-24", "w-16", "w-28", "w-12"];

export function TableSkeleton({ rows = 5, cols = 4 }: TableSkeletonProps) {
  return (
    <div className="rounded-xl border border-border bg-surface overflow-hidden" aria-label="Loading…" role="status">
      {/* Header row */}
      <div className="flex items-center gap-6 px-4 py-3 border-b border-border bg-surface-elevated/60">
        {Array.from({ length: cols }).map((_, ci) => (
          <div
            key={ci}
            className={`h-3 rounded animate-pulse bg-surface-elevated ${COL_WIDTHS[ci % COL_WIDTHS.length]}`}
            aria-hidden="true"
          />
        ))}
      </div>

      {/* Data rows */}
      {Array.from({ length: rows }).map((_, ri) => (
        <div
          key={ri}
          className="flex items-center gap-6 px-4 py-4 border-b border-border/50 last:border-b-0"
        >
          {Array.from({ length: cols }).map((_, ci) => {
            // First column is slightly wider (name-like), last is narrower (actions-like)
            const isFirst = ci === 0;
            const isLast = ci === cols - 1;
            const widthClass = isFirst
              ? "flex-1 max-w-[160px]"
              : isLast
              ? "w-16 ml-auto"
              : COL_WIDTHS[(ri + ci) % COL_WIDTHS.length];
            return (
              <div
                key={ci}
                className={`h-4 rounded animate-pulse bg-surface-elevated ${widthClass}`}
                aria-hidden="true"
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}
