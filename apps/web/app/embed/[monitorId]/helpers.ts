export type EmbedStatus = 'up' | 'down' | 'degraded' | 'paused';

export function statusColor(status: EmbedStatus): string {
  switch (status) {
    case 'up':
      return '#3fb950';
    case 'degraded':
      return '#d29922';
    case 'down':
      return '#f85149';
    case 'paused':
      return '#9ca3af';
    default:
      return '#9ca3af';
  }
}

export function statusLabel(status: EmbedStatus): string {
  switch (status) {
    case 'up':
      return 'Operational';
    case 'degraded':
      return 'Degraded';
    case 'down':
      return 'Down';
    case 'paused':
      return 'Paused';
    default:
      return 'Unknown';
  }
}

export function formatUptime(pct: number): string {
  return `${pct.toFixed(2)}%`;
}

export function formatLatency(ms: number | null): string {
  if (ms === null) return '—';
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}
