'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Activity,
  RefreshCw,
  Clock,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Layers,
} from 'lucide-react';
import { AppFrame } from '../../../components/app-frame';
import { Card } from '../../components/Card';
import { Badge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { getUser } from '../../../components/auth';
import { api } from '../../../lib/api';
import { useToast } from '../../../components/ui/toast';

type Segment = {
  start: string;
  end: string;
  level: 'green' | 'yellow' | 'red';
};

type MonitorTimeline = {
  id: string;
  name: string;
  type: string;
  folder: string | null;
  segments: Segment[];
  currentLevel: string;
  uptimePct: number;
};

type TimelineData = {
  monitors: MonitorTimeline[];
  from: string;
  to: string;
  totalHours: number;
};

const HOUR_OPTIONS = [
  { label: '1h', value: 1 },
  { label: '3h', value: 3 },
  { label: '6h', value: 6 },
  { label: '12h', value: 12 },
  { label: '24h', value: 24 },
  { label: '48h', value: 48 },
  { label: '7d', value: 168 },
];

function levelColor(level: 'green' | 'yellow' | 'red'): string {
  if (level === 'green') return 'bg-success';
  if (level === 'yellow') return 'bg-warning';
  return 'bg-error';
}

function levelLabel(level: string) {
  if (level === 'green') return 'Operational';
  if (level === 'yellow') return 'Degraded';
  return 'Down';
}

function StatusDot({ level }: { level: string }) {
  if (level === 'green') return <CheckCircle className="w-3.5 h-3.5 text-success shrink-0" />;
  if (level === 'yellow') return <AlertTriangle className="w-3.5 h-3.5 text-warning shrink-0" />;
  return <XCircle className="w-3.5 h-3.5 text-error shrink-0" />;
}

function UptimeBadge({ pct }: { pct: number }) {
  const color = pct >= 99 ? 'text-success' : pct >= 95 ? 'text-warning' : 'text-error';
  return <span className={`text-xs font-mono font-semibold ${color}`}>{pct.toFixed(2)}%</span>;
}

function TimelineBar({ segments, from, to }: { segments: Segment[]; from: string; to: string }) {
  const windowMs = new Date(to).getTime() - new Date(from).getTime();
  if (windowMs <= 0 || segments.length === 0) {
    return <div className="h-6 rounded bg-surface-elevated w-full" />;
  }

  return (
    <div className="h-6 rounded overflow-hidden flex w-full min-w-0">
      {segments.map((seg, i) => {
        const segStart = Math.max(new Date(seg.start).getTime(), new Date(from).getTime());
        const segEnd = Math.min(new Date(seg.end).getTime(), new Date(to).getTime());
        const widthPct = Math.max(0, ((segEnd - segStart) / windowMs) * 100);
        if (widthPct < 0.01) return null;
        return (
          <div
            key={i}
            className={`${levelColor(seg.level)} h-full shrink-0`}
            style={{ width: `${widthPct}%` }}
            title={`${levelLabel(seg.level)} — ${new Date(seg.start).toLocaleTimeString()} → ${new Date(seg.end).toLocaleTimeString()}`}
          />
        );
      })}
    </div>
  );
}

function TimeAxis({ from, to, hours }: { from: string; to: string; hours: number }) {
  const fromMs = new Date(from).getTime();
  const toMs = new Date(to).getTime();
  const windowMs = toMs - fromMs;

  // Choose tick interval based on window size
  let tickIntervalMs: number;
  let tickFormat: (d: Date) => string;

  if (hours <= 3) {
    tickIntervalMs = 30 * 60 * 1000; // 30min
    tickFormat = d => d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } else if (hours <= 12) {
    tickIntervalMs = 60 * 60 * 1000; // 1h
    tickFormat = d => d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } else if (hours <= 48) {
    tickIntervalMs = 3 * 60 * 60 * 1000; // 3h
    tickFormat = d => d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } else {
    tickIntervalMs = 12 * 60 * 60 * 1000; // 12h
    tickFormat = d => `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} ${d.toLocaleTimeString([], { hour: '2-digit' })}`;
  }

  const ticks: Array<{ label: string; pct: number }> = [];
  // Start from first round tick after `from`
  let t = Math.ceil(fromMs / tickIntervalMs) * tickIntervalMs;
  while (t <= toMs) {
    const pct = ((t - fromMs) / windowMs) * 100;
    if (pct >= 0 && pct <= 100) {
      ticks.push({ label: tickFormat(new Date(t)), pct });
    }
    t += tickIntervalMs;
  }

  return (
    <div className="relative h-5 w-full select-none">
      {ticks.map((tick, i) => (
        <div
          key={i}
          className="absolute top-0 -translate-x-1/2 text-[10px] text-text-muted whitespace-nowrap"
          style={{ left: `${tick.pct}%` }}
        >
          {tick.label}
        </div>
      ))}
    </div>
  );
}

export default function MonitorTimelinePage() {
  const router = useRouter();
  const { showToast } = useToast();
  const [data, setData] = useState<TimelineData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedHours, setSelectedHours] = useState(24);
  const [search, setSearch] = useState('');
  const [filterLevel, setFilterLevel] = useState<string>('all');

  const load = useCallback(async (hours: number) => {
    setLoading(true);
    try {
      const user = await getUser();
      if (!user) { router.push('/login'); return; }
      const res = await api.get(`/monitors/status-timeline?hours=${hours}`);
      setData(res as TimelineData);
    } catch {
      showToast('Failed to load status timeline', 'error');
    } finally {
      setLoading(false);
    }
  }, [router, showToast]);

  useEffect(() => { load(selectedHours); }, [selectedHours, load]);

  const handleHoursChange = (h: number) => {
    setSelectedHours(h);
  };

  const filteredMonitors = (data?.monitors ?? []).filter(m => {
    const matchSearch = m.name.toLowerCase().includes(search.toLowerCase()) ||
      m.type.toLowerCase().includes(search.toLowerCase()) ||
      (m.folder ?? '').toLowerCase().includes(search.toLowerCase());
    const matchLevel = filterLevel === 'all' || m.currentLevel === filterLevel;
    return matchSearch && matchLevel;
  });

  // Summary stats
  const total = data?.monitors.length ?? 0;
  const operational = data?.monitors.filter(m => m.currentLevel === 'green').length ?? 0;
  const degraded = data?.monitors.filter(m => m.currentLevel === 'yellow').length ?? 0;
  const down = data?.monitors.filter(m => m.currentLevel === 'red').length ?? 0;
  const avgUptime = total > 0
    ? Math.round((data!.monitors.reduce((s, m) => s + m.uptimePct, 0) / total) * 100) / 100
    : 100;

  return (
    <AppFrame title="Status Timeline">
      <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 py-6 space-y-6">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-text-primary flex items-center gap-2">
              <Layers className="w-6 h-6 text-accent" />
              Status Timeline
            </h1>
            <p className="text-sm text-text-secondary mt-1">
              Gantt-style view of all monitor states — correlate outages across services.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {/* Period selector */}
            <div className="flex rounded-lg overflow-hidden border border-border">
              {HOUR_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => handleHoursChange(opt.value)}
                  className={`px-3 py-1.5 text-sm font-medium transition-colors ${
                    selectedHours === opt.value
                      ? 'bg-accent text-white'
                      : 'bg-surface text-text-secondary hover:text-text-primary hover:bg-surface-elevated'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => load(selectedHours)}
              disabled={loading}
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Card className="p-4 flex items-center gap-3">
            <Activity className="w-5 h-5 text-accent shrink-0" />
            <div>
              <div className="text-2xl font-bold text-text-primary">{total}</div>
              <div className="text-xs text-text-secondary">Total Monitors</div>
            </div>
          </Card>
          <Card className="p-4 flex items-center gap-3">
            <CheckCircle className="w-5 h-5 text-success shrink-0" />
            <div>
              <div className="text-2xl font-bold text-success">{operational}</div>
              <div className="text-xs text-text-secondary">Operational</div>
            </div>
          </Card>
          <Card className="p-4 flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-warning shrink-0" />
            <div>
              <div className="text-2xl font-bold text-warning">{degraded}</div>
              <div className="text-xs text-text-secondary">Degraded</div>
            </div>
          </Card>
          <Card className="p-4 flex items-center gap-3">
            <XCircle className="w-5 h-5 text-error shrink-0" />
            <div>
              <div className="text-2xl font-bold text-error">{down}</div>
              <div className="text-xs text-text-secondary">Down</div>
            </div>
          </Card>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            placeholder="Search monitors…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="flex-1 px-3 py-2 bg-surface border border-border rounded-lg text-sm text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-accent"
          />
          <div className="flex rounded-lg overflow-hidden border border-border self-start sm:self-auto">
            {(['all', 'green', 'yellow', 'red'] as const).map(lvl => (
              <button
                key={lvl}
                onClick={() => setFilterLevel(lvl)}
                className={`px-3 py-2 text-sm font-medium transition-colors capitalize ${
                  filterLevel === lvl
                    ? 'bg-accent text-white'
                    : 'bg-surface text-text-secondary hover:text-text-primary hover:bg-surface-elevated'
                }`}
              >
                {lvl === 'all' ? 'All' : levelLabel(lvl)}
              </button>
            ))}
          </div>
        </div>

        {/* Timeline chart */}
        <Card className="p-4 sm:p-6 overflow-hidden">
          {loading ? (
            <div className="space-y-4">
              {[1, 2, 3, 4, 5].map(i => (
                <div key={i} className="flex items-center gap-4 animate-pulse">
                  <div className="w-40 h-4 bg-surface-elevated rounded" />
                  <div className="flex-1 h-6 bg-surface-elevated rounded" />
                  <div className="w-12 h-4 bg-surface-elevated rounded" />
                </div>
              ))}
            </div>
          ) : filteredMonitors.length === 0 ? (
            <div className="text-center py-12">
              <Activity className="w-10 h-10 text-text-muted mx-auto mb-3 opacity-40" />
              <p className="text-text-secondary text-sm">
                {total === 0 ? 'No monitors yet. Create a monitor to see its status timeline.' : 'No monitors match your filters.'}
              </p>
            </div>
          ) : (
            <div className="space-y-0">
              {/* Column headers */}
              <div className="flex items-center gap-4 pb-2 border-b border-border mb-3">
                <div className="w-44 sm:w-56 shrink-0 text-xs font-semibold text-text-muted uppercase tracking-wider">Monitor</div>
                <div className="flex-1 min-w-0">
                  {data && (
                    <TimeAxis from={data.from} to={data.to} hours={selectedHours} />
                  )}
                </div>
                <div className="w-16 text-right text-xs font-semibold text-text-muted uppercase tracking-wider">Uptime</div>
              </div>

              {/* Monitor rows */}
              <div className="space-y-2">
                {filteredMonitors.map(monitor => (
                  <div
                    key={monitor.id}
                    className="flex items-center gap-4 group cursor-pointer hover:bg-surface-elevated/40 rounded-lg px-1 py-1 -mx-1 transition-colors"
                    onClick={() => router.push(`/monitors/${monitor.id}`)}
                  >
                    {/* Name + status */}
                    <div className="w-44 sm:w-56 shrink-0 flex items-center gap-2 min-w-0">
                      <StatusDot level={monitor.currentLevel} />
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-text-primary truncate group-hover:text-accent transition-colors">
                          {monitor.name}
                        </div>
                        {monitor.folder && (
                          <div className="text-[10px] text-text-muted truncate">{monitor.folder}</div>
                        )}
                      </div>
                    </div>

                    {/* Timeline bar */}
                    <div className="flex-1 min-w-0">
                      {data ? (
                        <TimelineBar segments={monitor.segments} from={data.from} to={data.to} />
                      ) : null}
                    </div>

                    {/* Uptime % */}
                    <div className="w-16 text-right">
                      <UptimeBadge pct={monitor.uptimePct} />
                    </div>
                  </div>
                ))}
              </div>

              {/* Legend + avg uptime */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-4 mt-2 border-t border-border">
                <div className="flex items-center gap-4 text-xs text-text-muted">
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded-sm bg-success" />
                    Operational
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded-sm bg-warning" />
                    Degraded
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-3 h-3 rounded-sm bg-error" />
                    Down
                  </div>
                </div>
                <div className="flex items-center gap-2 text-xs text-text-secondary">
                  <Clock className="w-3.5 h-3.5" />
                  <span>
                    {data && new Date(data.from).toLocaleString()} →{' '}
                    {data && new Date(data.to).toLocaleString()}
                  </span>
                  <span className="text-text-muted">·</span>
                  <span>Avg uptime: <UptimeBadge pct={avgUptime} /></span>
                </div>
              </div>
            </div>
          )}
        </Card>
      </div>
    </AppFrame>
  );
}
