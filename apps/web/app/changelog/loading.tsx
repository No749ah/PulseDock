import { AppFrame } from '../../components/app-frame';

export default function Loading() {
  return (
    <AppFrame title="Changelog">
      <div className="space-y-6 max-w-3xl mx-auto">
        <div className="space-y-1.5">
          <div className="h-7 w-32 animate-pulse rounded bg-surface-elevated" />
          <div className="h-3 w-48 animate-pulse rounded bg-surface-elevated" />
        </div>
        {/* Timeline skeleton */}
        <div className="space-y-8 border-l-2 border-border pl-6 ml-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <div className="flex items-center gap-3">
                <div className="h-5 w-16 animate-pulse rounded-full bg-surface-elevated" />
                <div className="h-3 w-24 animate-pulse rounded bg-surface-elevated" />
              </div>
              <div className="h-4 w-3/4 animate-pulse rounded bg-surface-elevated" />
              <div className="h-3 w-1/2 animate-pulse rounded bg-surface-elevated" />
            </div>
          ))}
        </div>
      </div>
    </AppFrame>
  );
}
