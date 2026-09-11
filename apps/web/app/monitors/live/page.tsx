'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Activity, AlertCircle, AlertTriangle, CheckCircle2, Circle, Clock, Filter, Pause, Play, RefreshCw, Wifi, WifiOff, Zap } from 'lucide-react';
import { AppFrame } from '../../../components/app-frame';
import { api } from '../../../lib/api';
import { getUser } from '../../../components/auth';
import { useToast } from '../../../components/ui/toast';

interface LiveRun {
  id: string;
  monitorId: string;
  monitorName: string | null;
  monitorType: string | null;
  monitorUrl: string | null;
  checkedAt: string;
  ok: boolean;
  statusCode: number | null;
  latencyMs: number | null;
  message: string | null;
  level: 'green' | 'yellow' | 'red';
  responseSizeBytes: number | null;
}

interface LiveStats {
  totalRuns: number;
  failedRuns: number;
  degradedRuns: number;
  successRuns: number;
  failureRatePct: number;
  avgLatencyMs: number | null;
  checksPerMin: number | null;
}

interface LiveFeedResponse {
  items: LiveRun[];
  stats: LiveStats;
  latestCheckedAt: string | null;
}

const LEVEL_CONFIG = {
  green: { label: 'OK', color: 'text-success', bg: 'bg-success/10', border: 'border-success/20', icon: CheckCircle2, dot: 'bg-success' },
  yellow: { label: 'Degraded', color: 'text-warning', bg: 'bg-warning/10', border: 'border-warning/20', icon: AlertTriangle, dot: 'bg-warning' },
  red: { label: 'Down', color: 'text-danger', bg: 'bg-danger/10', border: 'border-danger/20', icon: AlertCircle, dot: 'bg-danger' },
};

function levelLabel(level: string): string {
  if (level === 'green') return 'OK';
  if (level === 'yellow') return 'Degraded';
  if (level === 'red') return 'Down';
  return level;
}

function fmtLatency(ms: number | null): string {
  if (ms == null) return '—';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function fmtSize(bytes: number | null): string {
  if (bytes == null) return '';
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

function fmtAge(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 5) return 'just now';
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  return `${Math.floor(diff / 3600)}h ago`;
}

function MonitorTypeBadge({ type }: { type: string | null }) {
  if (!type) return null;
  return (
    <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-medium bg-surface-elevated text-text-muted border border-border">
      {type}
    </span>
  );
}

function StatCard({ label, value, sub, color }: { label: string; value: string | null; sub?: string; color?: string }) {
  return (
    <div className="bg-surface-card border border-border rounded-xl px-4 py-3 flex flex-col gap-0.5">
      <span className="text-xs text-text-muted uppercase tracking-wider">{label}</span>
      <span className={`text-2xl font-bold tabular-nums ${color ?? 'text-text-primary'}`}>
        {value ?? '—'}
      </span>
      {sub && <span className="text-xs text-text-muted">{sub}</span>}
    </div>
  );
}

export default function LiveFeedPage() {
  const { error: toastError } = useToast();

  const [items, setItems] = useState<LiveRun[]>([]);
  const [stats, setStats] = useState<LiveStats | null>(null);
  const [paused, setPaused] = useState(false);
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const [filterLevel, setFilterLevel] = useState<string>('all');
  const [filterType, setFilterType] = useState<string>('all');
  const [searchText, setSearchText] = useState('');
  const [maxItems, setMaxItems] = useState(200);
  const [pollIntervalMs] = useState(3000);

  const latestCheckedAtRef = useRef<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchFeed = useCallback(async (since?: string) => {
    if (!getUser()) return;
    try {
      const params = new URLSearchParams({ limit: '100' });
      if (since) params.set('since', since);
      if (filterLevel !== 'all') params.set('level', filterLevel);
      if (filterType !== 'all') params.set('type', filterType);

      const data = await api<LiveFeedResponse>(`/v1/monitors/live-feed?${params.toString()}`);

      if (since && data.items.length > 0) {
        // Incremental update — prepend new items
        const newIds = new Set(data.items.map((r) => r.id));
        setItems((prev) => {
          const merged = [...data.items, ...prev.filter((r) => !newIds.has(r.id))];
          return merged.slice(0, maxItems);
        });
      } else if (!since) {
        // Initial load
        setItems(data.items.slice(0, maxItems));
      }

      if (data.latestCheckedAt) {
        latestCheckedAtRef.current = data.latestCheckedAt;
      }
      setStats(data.stats);
      setConnected(true);
    } catch {
      setConnected(false);
      toastError('Failed to fetch live feed');
    } finally {
      setLoading(false);
    }
  }, [filterLevel, filterType, maxItems, toastError]);

  // Initial load
  useEffect(() => {
    setLoading(true);
    latestCheckedAtRef.current = null;
    setItems([]);
    fetchFeed(undefined);
  }, [filterLevel, filterType]);

  // Polling
  useEffect(() => {
    if (paused) {
      if (pollRef.current) clearTimeout(pollRef.current);
      return;
    }

    const schedulePoll = () => {
      pollRef.current = setTimeout(async () => {
        await fetchFeed(latestCheckedAtRef.current ?? undefined);
        schedulePoll();
      }, pollIntervalMs);
    };

    schedulePoll();
    return () => {
      if (pollRef.current) clearTimeout(pollRef.current);
    };
  }, [paused, fetchFeed, pollIntervalMs]);

  // Filter items client-side (for search)
  const visibleItems = items.filter((r) => {
    if (searchText) {
      const q = searchText.toLowerCase();
      if (
        !r.monitorName?.toLowerCase().includes(q) &&
        !r.monitorUrl?.toLowerCase().includes(q) &&
        !r.message?.toLowerCase().includes(q)
      ) return false;
    }
    return true;
  });

  const allTypes = Array.from(new Set(items.map((r) => r.monitorType).filter(Boolean))) as string[];

  return (
    <AppFrame title="Live Check Feed">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-success/20 to-success/5 border border-success/20 flex items-center justify-center">
            <Activity className="w-5 h-5 text-success" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-text-primary">Live Check Feed</h1>
            <p className="text-sm text-text-muted">Real-time monitor check results across your fleet</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Connection indicator */}
          <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border ${
            connected
              ? 'bg-success/10 border-success/20 text-success'
              : 'bg-danger/10 border-danger/20 text-danger'
          }`}>
            {connected ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
            {connected ? 'Live' : 'Disconnected'}
          </div>

          {/* Pause/Resume */}
          <button
            onClick={() => setPaused((p) => !p)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
              paused
                ? 'bg-warning/10 border-warning/20 text-warning hover:bg-warning/20'
                : 'bg-surface-card border-border text-text-muted hover:text-text-primary hover:border-border-muted'
            }`}
          >
            {paused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
            {paused ? 'Resume' : 'Pause'}
          </button>

          {/* Manual refresh */}
          <button
            onClick={() => fetchFeed(undefined)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-border bg-surface-card text-text-muted hover:text-text-primary transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh
          </button>
        </div>
      </div>

      {/* Stats row */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
          <StatCard
            label="Checks/min"
            value={stats.checksPerMin != null ? stats.checksPerMin.toFixed(1) : null}
            color="text-text-primary"
          />
          <StatCard
            label="Failure rate"
            value={`${stats.failureRatePct}%`}
            color={stats.failureRatePct > 10 ? 'text-danger' : stats.failureRatePct > 2 ? 'text-warning' : 'text-success'}
          />
          <StatCard
            label="Avg latency"
            value={stats.avgLatencyMs != null ? fmtLatency(stats.avgLatencyMs) : null}
            color={stats.avgLatencyMs != null && stats.avgLatencyMs > 2000 ? 'text-warning' : 'text-text-primary'}
          />
          <StatCard label="OK" value={String(stats.successRuns)} color="text-success" />
          <StatCard label="Degraded" value={String(stats.degradedRuns)} color="text-warning" />
          <StatCard label="Failed" value={String(stats.failedRuns)} color="text-danger" />
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <Filter className="w-4 h-4 text-text-muted flex-shrink-0" />

        {/* Level filter pills */}
        <div className="flex items-center gap-1">
          {['all', 'green', 'yellow', 'red'].map((l) => (
            <button
              key={l}
              onClick={() => setFilterLevel(l)}
              className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                filterLevel === l
                  ? l === 'all' ? 'bg-accent/20 text-accent border border-accent/30'
                    : l === 'green' ? 'bg-success/20 text-success border border-success/30'
                    : l === 'yellow' ? 'bg-warning/20 text-warning border border-warning/30'
                    : 'bg-danger/20 text-danger border border-danger/30'
                  : 'bg-surface-card text-text-muted border border-border hover:text-text-primary'
              }`}
            >
              {l === 'all' ? 'All' : levelLabel(l)}
            </button>
          ))}
        </div>

        {/* Type filter */}
        {allTypes.length > 0 && (
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="px-2.5 py-1 rounded-lg text-xs bg-surface-card border border-border text-text-muted hover:text-text-primary cursor-pointer outline-none"
          >
            <option value="all">All types</option>
            {allTypes.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        )}

        {/* Search */}
        <input
          type="text"
          placeholder="Search monitors…"
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          className="px-3 py-1 rounded-lg text-xs bg-surface-card border border-border text-text-primary placeholder:text-text-muted outline-none focus:border-accent/50 transition-colors ml-auto sm:w-48"
        />

        <span className="text-xs text-text-muted ml-1">
          {visibleItems.length} run{visibleItems.length !== 1 ? 's' : ''}
          {paused && <span className="ml-1 text-warning font-medium">· paused</span>}
        </span>
      </div>

      {/* Feed table */}
      <div className="bg-surface-card border border-border rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-8 text-center">
            <div className="inline-flex items-center gap-2 text-text-muted text-sm">
              <Activity className="w-4 h-4 animate-pulse" />
              Connecting to live feed…
            </div>
          </div>
        ) : visibleItems.length === 0 ? (
          <div className="p-12 text-center">
            <div className="w-12 h-12 rounded-full bg-surface-elevated border border-border flex items-center justify-center mx-auto mb-3">
              <Zap className="w-6 h-6 text-text-muted" />
            </div>
            <p className="text-text-muted text-sm">
              {filterLevel !== 'all' || filterType !== 'all'
                ? 'No checks match the current filters'
                : 'No check results yet — checks will appear here as they run'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-text-muted uppercase tracking-wide w-24">Status</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-text-muted uppercase tracking-wide">Monitor</th>
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-text-muted uppercase tracking-wide hidden md:table-cell">Type</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-text-muted uppercase tracking-wide w-20">Latency</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-text-muted uppercase tracking-wide hidden sm:table-cell w-16">Code</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-text-muted uppercase tracking-wide hidden lg:table-cell w-16">Size</th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-text-muted uppercase tracking-wide w-24">When</th>
                </tr>
              </thead>
              <tbody>
                {visibleItems.map((run) => {
                  const cfg = LEVEL_CONFIG[run.level] ?? LEVEL_CONFIG.green;
                  const LevelIcon = cfg.icon;
                  return (
                    <tr
                      key={run.id}
                      className="border-b border-border/50 last:border-0 transition-colors hover:bg-surface-elevated/50"
                    >
                      {/* Status */}
                      <td className="px-4 py-2.5">
                        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border ${cfg.bg} ${cfg.color} ${cfg.border}`}>
                          <LevelIcon className="w-3 h-3" />
                          {cfg.label}
                        </span>
                      </td>

                      {/* Monitor name */}
                      <td className="px-4 py-2.5">
                        <div className="flex flex-col gap-0.5">
                          <a
                            href={`/monitors/${run.monitorId}`}
                            className="font-medium text-text-primary hover:text-accent transition-colors truncate max-w-[180px] md:max-w-[280px] block"
                          >
                            {run.monitorName ?? run.monitorId}
                          </a>
                          {run.message && (
                            <span className="text-xs text-text-muted truncate max-w-[180px] md:max-w-[280px]">
                              {run.message}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Type */}
                      <td className="px-4 py-2.5 hidden md:table-cell">
                        <MonitorTypeBadge type={run.monitorType} />
                      </td>

                      {/* Latency */}
                      <td className="px-4 py-2.5 text-right">
                        <span className={`font-mono text-xs tabular-nums ${
                          run.latencyMs != null && run.latencyMs > 2000
                            ? 'text-warning'
                            : run.latencyMs != null && run.latencyMs > 5000
                            ? 'text-danger'
                            : 'text-text-primary'
                        }`}>
                          {fmtLatency(run.latencyMs)}
                        </span>
                      </td>

                      {/* Status code */}
                      <td className="px-4 py-2.5 text-right hidden sm:table-cell">
                        {run.statusCode != null ? (
                          <span className={`font-mono text-xs tabular-nums ${
                            run.statusCode >= 500 ? 'text-danger' :
                            run.statusCode >= 400 ? 'text-warning' :
                            'text-text-muted'
                          }`}>
                            {run.statusCode}
                          </span>
                        ) : (
                          <span className="text-text-muted text-xs">—</span>
                        )}
                      </td>

                      {/* Size */}
                      <td className="px-4 py-2.5 text-right hidden lg:table-cell">
                        <span className="text-xs text-text-muted font-mono">
                          {fmtSize(run.responseSizeBytes)}
                        </span>
                      </td>

                      {/* Time */}
                      <td className="px-4 py-2.5 text-right">
                        <span className="text-xs text-text-muted tabular-nums" title={run.checkedAt}>
                          {fmtAge(run.checkedAt)}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Footer info */}
      <div className="flex items-center justify-between mt-3 px-1">
        <div className="flex items-center gap-4 text-xs text-text-muted">
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            Refreshes every {pollIntervalMs / 1000}s
          </span>
          <span className="flex items-center gap-1">
            <Circle className="w-3 h-3" />
            Showing last {maxItems} runs
          </span>
        </div>
        <select
          value={maxItems}
          onChange={(e) => setMaxItems(Number(e.target.value))}
          className="text-xs bg-transparent border-0 text-text-muted cursor-pointer outline-none"
        >
          <option value={100}>Keep 100</option>
          <option value={200}>Keep 200</option>
          <option value={500}>Keep 500</option>
        </select>
      </div>
    </AppFrame>
  );
}
