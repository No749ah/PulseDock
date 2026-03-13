import { MonitorListSkeleton } from '../components/Skeleton';
import { AppFrame } from '../../components/app-frame';

export default function Loading() {
  return (
    <AppFrame title="Monitors">
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <div className="h-6 w-32 animate-pulse rounded bg-surface-elevated" />
            <div className="h-3 w-48 animate-pulse rounded bg-surface-elevated" />
          </div>
          <div className="h-9 w-32 animate-pulse rounded-lg bg-surface-elevated" />
        </div>
        <MonitorListSkeleton count={6} />
      </div>
    </AppFrame>
  );
}
