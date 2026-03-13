import { notFound } from 'next/navigation';
import { API_BASE } from '../../../lib/api';

type MonitorStatus = {
  id: string;
  name: string;
  type: string;
  level: 'green' | 'yellow' | 'red';
  lastChecked: string | null;
  message: string | null;
  latencyMs: number | null;
};

type RecentEvent = {
  id: string;
  monitorId: string;
  checkedAt: string;
  ok: boolean;
  latencyMs: number | null;
  message: string | null;
  level: 'green' | 'yellow' | 'red';
};

type PublicOverview = {
  userId: string;
  displayName: string;
  totalMonitors: number;
  green: number;
  yellow: number;
  red: number;
  uptimePct: number;
  monitors: MonitorStatus[];
  recentEvents: RecentEvent[];
};

function levelBadge(level: 'green' | 'yellow' | 'red') {
  const map = {
    green: 'bg-green-500/15 text-green-300 ring-1 ring-green-500/30',
    yellow: 'bg-yellow-500/15 text-yellow-300 ring-1 ring-yellow-500/30',
    red: 'bg-red-500/15 text-red-300 ring-1 ring-red-500/30',
  };
  const labels = { green: 'Operational', yellow: 'Degraded', red: 'Outage' };
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${map[level]}`}>
      <span className={`mr-1.5 h-1.5 w-1.5 rounded-full ${level === 'green' ? 'bg-green-400' : level === 'yellow' ? 'bg-yellow-400' : 'bg-red-400'}`} />
      {labels[level]}
    </span>
  );
}

function overallStatus(data: PublicOverview) {
  if (data.red > 0) return { label: 'Major Outage', color: 'text-red-400', bg: 'bg-red-500/10 border-red-500/20', dot: 'bg-red-400' };
  if (data.yellow > 0) return { label: 'Partial Degradation', color: 'text-yellow-400', bg: 'bg-yellow-500/10 border-yellow-500/20', dot: 'bg-yellow-400' };
  return { label: 'All Systems Operational', color: 'text-green-400', bg: 'bg-green-500/10 border-green-500/20', dot: 'bg-green-400' };
}

function formatRelative(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default async function PublicStatusPage({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;

  const response = await fetch(`${API_BASE}/v1/public/overview/${userId}`, { cache: 'no-store' });
  if (response.status === 404) notFound();
  if (!response.ok) throw new Error(`Failed to load status: ${response.status}`);

  const data: PublicOverview = await response.json();
  const status = overallStatus(data);

  return (
    <main className="min-h-screen bg-bg px-4 pb-16 pt-8">
      <div className="mx-auto max-w-4xl space-y-6">

        {/* Header */}
        <div className="text-center">
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-accent">Status Page</div>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight text-text-primary">{data.displayName}</h1>
          <p className="mt-1 text-sm text-text-secondary">Live service health dashboard</p>
        </div>

        {/* Overall Status Banner */}
        <div className={`flex items-center gap-3 rounded-2xl border p-5 ${status.bg}`}>
          <span className={`relative flex h-3 w-3`}>
            <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${status.dot}`} />
            <span className={`relative inline-flex h-3 w-3 rounded-full ${status.dot}`} />
          </span>
          <span className={`text-lg font-semibold ${status.color}`}>{status.label}</span>
          <span className="ml-auto text-sm text-text-secondary">{data.uptimePct}% uptime</span>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: 'Total', value: data.totalMonitors, color: 'text-text-primary' },
            { label: 'Operational', value: data.green, color: 'text-green-400' },
            { label: 'Degraded', value: data.yellow, color: 'text-yellow-400' },
            { label: 'Outage', value: data.red, color: 'text-red-400' },
          ].map((stat) => (
            <div key={stat.label} className="rounded-xl border border-border bg-surface p-4 text-center">
              <div className={`text-2xl font-semibold ${stat.color}`}>{stat.value}</div>
              <div className="mt-0.5 text-xs text-text-secondary">{stat.label}</div>
            </div>
          ))}
        </div>

        {/* Monitor List */}
        <section className="rounded-2xl border border-border bg-surface shadow-xl shadow-black/20">
          <div className="border-b border-border px-6 py-4">
            <h2 className="font-semibold text-text-primary">Monitors</h2>
          </div>
          {data.monitors.length === 0 ? (
            <div className="px-6 py-12 text-center text-sm text-text-secondary">No monitors configured.</div>
          ) : (
            <ul className="divide-y divide-border">
              {data.monitors.map((monitor) => (
                <li key={monitor.id} className="flex items-center gap-4 px-6 py-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-medium text-text-primary">{monitor.name}</span>
                      <span className="shrink-0 rounded-md bg-bg px-1.5 py-0.5 text-xs text-text-secondary ring-1 ring-border">
                        {monitor.type}
                      </span>
                    </div>
                    <div className="mt-0.5 flex items-center gap-3 text-xs text-text-secondary">
                      {monitor.lastChecked && <span>{formatRelative(monitor.lastChecked)}</span>}
                      {monitor.latencyMs !== null && <span>{monitor.latencyMs}ms</span>}
                      {monitor.message && monitor.level !== 'green' && (
                        <span className="truncate">{monitor.message}</span>
                      )}
                    </div>
                  </div>
                  <div className="shrink-0">{levelBadge(monitor.level)}</div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Recent Events */}
        {data.recentEvents.length > 0 && (
          <section className="rounded-2xl border border-border bg-surface shadow-xl shadow-black/20">
            <div className="border-b border-border px-6 py-4">
              <h2 className="font-semibold text-text-primary">Recent Events</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs text-text-secondary">
                    <th className="px-6 py-3 font-medium">Time</th>
                    <th className="px-6 py-3 font-medium">Status</th>
                    <th className="px-6 py-3 font-medium">Message</th>
                    <th className="px-6 py-3 font-medium">Latency</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {data.recentEvents.map((event) => (
                    <tr key={event.id} className="text-text-primary hover:bg-surface/80">
                      <td className="px-6 py-3 text-xs text-text-secondary">{formatRelative(event.checkedAt)}</td>
                      <td className="px-6 py-3">{levelBadge(event.level)}</td>
                      <td className="px-6 py-3 max-w-xs truncate text-xs text-text-secondary">{event.message ?? '—'}</td>
                      <td className="px-6 py-3 text-xs text-text-secondary">{event.latencyMs !== null ? `${event.latencyMs}ms` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* Footer */}
        <div className="text-center text-xs text-text-secondary">
          Powered by{' '}
          <span className="font-semibold text-accent">PulseDock</span>
          {' '}— Open-source version intelligence &amp; uptime monitoring
        </div>
      </div>
    </main>
  );
}
