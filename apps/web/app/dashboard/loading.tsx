import { DashboardStatsSkeleton } from '../components/Skeleton';
import { AppFrame } from '../../components/app-frame';

export default function Loading() {
  return (
    <AppFrame title="Dashboard">
      <div className="p-6 space-y-6">
        <div className="h-6 w-32 animate-pulse rounded bg-surface-elevated" />
        <DashboardStatsSkeleton />
      </div>
    </AppFrame>
  );
}
