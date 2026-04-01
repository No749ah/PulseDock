import { relativeTime } from './utils';
import type { DeliveryStats } from './types';

export function DeliveryStatsPanel({ stats }: { stats: DeliveryStats }) {
  const rateColor =
    stats.successRate >= 90
      ? 'text-green-400'
      : stats.successRate >= 70
        ? 'text-yellow-400'
        : 'text-red-400';

  return (
    <div className="space-y-3">
      {/* Summary row */}
      <div className="flex flex-wrap items-center gap-6 text-sm">
        <div className="flex flex-col">
          <span className="text-xs text-text-secondary mb-0.5">Success Rate</span>
          <span className={`text-lg font-bold ${rateColor}`}>{stats.successRate}%</span>
        </div>
        <div className="flex flex-col">
          <span className="text-xs text-text-secondary mb-0.5">Total Deliveries</span>
          <span className="text-sm font-semibold text-text-primary">{stats.totalDeliveries}</span>
        </div>
        <div className="flex flex-col">
          <span className="text-xs text-text-secondary mb-0.5">Last Delivery</span>
          <span className="text-sm text-text-primary">
            {stats.lastDeliveryAt ? relativeTime(stats.lastDeliveryAt) : 'Never'}
          </span>
        </div>
        <div className="flex flex-col">
          <span className="text-xs text-text-secondary mb-0.5">Last 24h</span>
          <span className="text-sm text-text-primary">
            <span className="text-green-400">{stats.last24hSuccess}✓</span>{' '}
            <span className="text-red-400">{stats.last24hFailure}✗</span>
          </span>
        </div>
      </div>

      {/* Recent deliveries dot row */}
      {stats.recentLogs.length > 0 && (
        <div className="space-y-1">
          <span className="text-xs text-text-secondary">Recent deliveries (newest first)</span>
          <div className="flex items-center gap-1.5 flex-wrap">
            {stats.recentLogs.map((log) => (
              <span
                key={log.id}
                title={`${log.success ? 'Success' : 'Failed'}${log.monitorName ? ` — ${log.monitorName}` : ''}${log.errorMessage ? `: ${log.errorMessage}` : ''}\n${relativeTime(log.triggeredAt)}`}
                className={`w-3 h-3 rounded-full cursor-default transition-opacity hover:opacity-70 ${log.success ? 'bg-green-400' : 'bg-red-400'}`}
              />
            ))}
          </div>
        </div>
      )}

      {/* Last failure error */}
      {stats.lastFailureAt && stats.recentLogs.find((l) => !l.success)?.errorMessage && (
        <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded px-3 py-1.5 font-mono truncate max-w-lg">
          {stats.recentLogs.find((l) => !l.success)?.errorMessage}
        </div>
      )}
    </div>
  );
}
