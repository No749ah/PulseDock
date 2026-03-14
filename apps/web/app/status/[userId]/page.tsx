import { notFound } from 'next/navigation';
import { API_BASE } from '../../../lib/api';

type LatencyPoint = { checkedAt: string; latencyMs: number };

type MonitorStatus = {
  id: string;
  name: string;
  type: string;
  level: 'green' | 'yellow' | 'red';
  lastChecked: string | null;
  message: string | null;
  latencyMs: number | null;
  uptimePct: number;
  latencyHistory: LatencyPoint[];
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

type Incident = {
  id: string;
  monitorId: string;
  monitorName: string;
  level: 'yellow' | 'red';
  startedAt: string;
  resolvedAt: string | null;
  durationMs: number | null;
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
  incidents: Incident[];
  recentEvents: RecentEvent[];
};

// ── Helpers ──────────────────────────────────────────────────────────────────

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

function formatDuration(ms: number) {
  const minutes = Math.floor(ms / 60000);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h`;
}

// ── Sparkline SVG ─────────────────────────────────────────────────────────────

function LatencySparkline({ points, level }: { points: LatencyPoint[]; level: 'green' | 'yellow' | 'red' }) {
  if (points.length < 2) {
    return <span className="text-xs text-text-secondary/40">no data</span>;
  }

  const W = 80;
  const H = 24;
  const pad = 2;

  const values = points.map((p) => p.latencyMs);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const toX = (i: number) => pad + (i / (points.length - 1)) * (W - pad * 2);
  const toY = (v: number) => pad + (1 - (v - min) / range) * (H - pad * 2);

  const pathD = values
    .map((v, i) => `${i === 0 ? 'M' : 'L'}${toX(i).toFixed(1)},${toY(v).toFixed(1)}`)
    .join(' ');

  const strokeColor = level === 'green' ? '#4ade80' : level === 'yellow' ? '#facc15' : '#f87171';
  const latestMs = values[values.length - 1];

  return (
    <div className="flex items-center gap-2">
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="shrink-0 overflow-visible">
        <path d={pathD} fill="none" stroke={strokeColor} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" opacity="0.8" />
        {/* Latest point dot */}
        <circle
          cx={toX(points.length - 1).toFixed(1)}
          cy={toY(latestMs).toFixed(1)}
          r="2"
          fill={strokeColor}
        />
      </svg>
      <span className="text-xs tabular-nums text-text-secondary">{latestMs}ms</span>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function PublicStatusPage({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;

  const response = await fetch(`${API_BASE}/v1/public/overview/${userId}`, { cache: 'no-store' });
  if (response.status === 404) notFound();
  if (!response.ok) throw new Error(`Failed to load status: ${response.status}`);

  const data: PublicOverview = await response.json();
  const status = overallStatus(data);

  const hasIncidents = data.incidents && data.incidents.length > 0;
  const openIncidents = data.incidents?.filter((i) => i.resolvedAt === null) ?? [];
  const resolvedIncidents = data.incidents?.filter((i) => i.resolvedAt !== null) ?? [];

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
          <span className="relative flex h-3 w-3">
            <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${status.dot}`} />
            <span className={`relative inline-flex h-3 w-3 rounded-full ${status.dot}`} />
          </span>
          <span className={`text-lg font-semibold ${status.color}`}>{status.label}</span>
          <span className="ml-auto text-sm tabular-nums text-text-secondary">{data.uptimePct}% uptime</span>
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

        {/* Active Incidents (if any) */}
        {openIncidents.length > 0 && (
          <section className="rounded-2xl border border-red-500/30 bg-red-500/5 shadow-xl shadow-black/20">
            <div className="border-b border-red-500/20 px-6 py-4">
              <h2 className="font-semibold text-red-400">🔴 Active Incidents ({openIncidents.length})</h2>
            </div>
            <ul className="divide-y divide-red-500/10">
              {openIncidents.map((incident) => (
                <li key={incident.id} className="flex flex-col gap-1 px-6 py-4 sm:flex-row sm:items-center sm:gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-text-primary">{incident.monitorName}</div>
                    <div className="mt-0.5 text-xs text-text-secondary">Started {formatRelative(incident.startedAt)} · Ongoing</div>
                  </div>
                  <div className="shrink-0">
                    {incident.level === 'red' ? (
                      <span className="inline-flex items-center rounded-full bg-red-500/15 px-2.5 py-1 text-xs font-semibold text-red-300 ring-1 ring-red-500/30">Outage</span>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-yellow-500/15 px-2.5 py-1 text-xs font-semibold text-yellow-300 ring-1 ring-yellow-500/30">Degraded</span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

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
                <li key={monitor.id} className="px-6 py-4">
                  <div className="flex items-start gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate font-medium text-text-primary">{monitor.name}</span>
                        <span className="shrink-0 rounded-md bg-bg px-1.5 py-0.5 text-xs text-text-secondary ring-1 ring-border">
                          {monitor.type}
                        </span>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-text-secondary">
                        {monitor.lastChecked && <span>Checked {formatRelative(monitor.lastChecked)}</span>}
                        <span className="tabular-nums">{monitor.uptimePct}% uptime</span>
                        {monitor.message && monitor.level !== 'green' && (
                          <span className="truncate max-w-[200px]">{monitor.message}</span>
                        )}
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-2">
                      {levelBadge(monitor.level)}
                      {monitor.latencyHistory.length >= 2 && (
                        <LatencySparkline points={monitor.latencyHistory} level={monitor.level} />
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Incident History */}
        {hasIncidents && resolvedIncidents.length > 0 && (
          <section className="rounded-2xl border border-border bg-surface shadow-xl shadow-black/20">
            <div className="border-b border-border px-6 py-4">
              <h2 className="font-semibold text-text-primary">Incident History</h2>
              <p className="mt-0.5 text-xs text-text-secondary">Recent resolved incidents</p>
            </div>
            <ul className="divide-y divide-border">
              {resolvedIncidents.map((incident) => (
                <li key={incident.id} className="flex flex-col gap-1 px-6 py-4 sm:flex-row sm:items-center sm:gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className={`h-2 w-2 shrink-0 rounded-full ${incident.level === 'red' ? 'bg-red-400' : 'bg-yellow-400'}`} />
                      <span className="font-medium text-text-primary">{incident.monitorName}</span>
                    </div>
                    <div className="mt-0.5 pl-4 text-xs text-text-secondary">
                      {formatRelative(incident.startedAt)}
                      {incident.durationMs !== null && (
                        <> · lasted {formatDuration(incident.durationMs)}</>
                      )}
                      {incident.resolvedAt && (
                        <> · resolved {formatRelative(incident.resolvedAt)}</>
                      )}
                    </div>
                  </div>
                  <div className="shrink-0 pl-4 sm:pl-0">
                    <span className="inline-flex items-center rounded-full bg-surface/80 px-2.5 py-1 text-xs text-text-secondary ring-1 ring-border">
                      Resolved ✓
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

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
                      <td className="px-6 py-3 text-xs tabular-nums text-text-secondary">{event.latencyMs !== null ? `${event.latencyMs}ms` : '—'}</td>
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
