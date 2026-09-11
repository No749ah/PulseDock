export type HealthStatus = 'healthy' | 'degraded' | 'failing' | 'untested';

export const STATUS_LABELS: Record<HealthStatus, string> = {
  healthy: 'Healthy',
  degraded: 'Degraded',
  failing: 'Failing',
  untested: 'Untested',
};

export const STATUS_COLORS: Record<HealthStatus, string> = {
  healthy: 'text-emerald-400',
  degraded: 'text-yellow-400',
  failing: 'text-red-400',
  untested: 'text-zinc-400',
};

export const STATUS_BG: Record<HealthStatus, string> = {
  healthy: 'bg-emerald-500/10',
  degraded: 'bg-yellow-500/10',
  failing: 'bg-red-500/10',
  untested: 'bg-zinc-500/10',
};

export function relativeTime(dateStr: string | null): string {
  if (!dateStr) return 'Never';
  const diff = Date.now() - new Date(dateStr).getTime();
  if (diff < 60000) return 'Just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}
