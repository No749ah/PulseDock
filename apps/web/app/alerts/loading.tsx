import { AlertChannelsSkeleton } from '../components/Skeleton';
import { AppFrame } from '../../components/app-frame';

export default function Loading() {
  return (
    <AppFrame title="Alerts">
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div className="h-6 w-36 animate-pulse rounded bg-surface-elevated" />
          <div className="h-9 w-36 animate-pulse rounded-lg bg-surface-elevated" />
        </div>
        <AlertChannelsSkeleton count={4} />
      </div>
    </AppFrame>
  );
}
