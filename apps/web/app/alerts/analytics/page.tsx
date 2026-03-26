'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Activity, AlertTriangle, CheckCircle2, TrendingDown, TrendingUp, XCircle, Zap } from 'lucide-react';
import { AppFrame } from '../../../components/app-frame';
import { getUser } from '../../../components/auth';
import { api } from '../../../lib/api';
import { useToast } from '../../../components/ui/toast';

// ─── Types ────────────────────────────────────────────────────────────────────

interface DailyCount {
  date: string;
  success: number;
  failed: number;
  total: number;
}

interface TopMonitor {
  monitorId: string;
  monitorName: string;
  count: number;
  failed: number;
}

interface ChannelStat {
  channelId: string;
  channelName: string;
  channelType: string;
  successRate: number;
  totalDeliveries: number;
  successCount: number;
  failedCount: number;
  avgDurationMs: number | null;
}

interface AnalyticsData {
  dailyCounts: DailyCount[];
  topMonitors: TopMonitor[];
  channelStats: ChannelStat[];
  totals: { success: number; failed: number; total: number };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00Z');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

function StatCard({ label, value, sub, color }: { label: string; value: string | number; sub?: string; color?: string }) {
  return (
    <div className="rounded-xl border border-border bg-surface-1 p-5">
      <p className="text-xs text-text-secondary uppercase tracking-wider mb-1">{label}</p>
      <p className={`text-3xl font-bold tabular-nums ${color ?? 'text-text-primary'}`}>{value}</p>
      {sub && <p className="text-xs text-text-secondary mt-1">{sub}</p>}
    </div>
  );
}

// ─── Mini Bar Chart ───────────────────────────────────────────────────────────

function DailyBarChart({ data }: { data: DailyCount[] }) {
  if (data.length === 0) return null;
  const max = Math.max(...data.map((d) => d.total), 1);

  return (
    <div className="rounded-xl border border-border bg-surface-1 p-5">
      <h3 className="text-sm font-semibold text-text-primary mb-4">Alert Deliveries — Last 30 Days</h3>
      <div className="flex items-end gap-[3px] h-32">
        {data.map((d) => {
          const totalH = Math.max((d.total / max) * 100, d.total > 0 ? 4 : 0);
          const failedH = d.total > 0 ? (d.failed / d.total) * totalH : 0;
          const successH = totalH - failedH;
          return (
            <div key={d.date} className="flex flex-col items-center flex-1 group relative">
              <div className="absolute bottom-full mb-1 hidden group-hover:flex flex-col items-center z-10 pointer-events-none">
                <div className="bg-surface-3 border border-border text-xs text-text-primary px-2 py-1 rounded whitespace-nowrap shadow-lg">
                  <div>{formatDate(d.date)}</div>
                  <div className="text-green-400">{d.success} ok</div>
                  {d.failed > 0 && <div className="text-red-400">{d.failed} failed</div>}
                </div>
              </div>
              <div className="w-full flex flex-col justify-end" style={{ height: '100%' }}>
                {successH > 0 && (
                  <div className="w-full rounded-t-sm bg-green-500/70" style={{ height: `${successH}%` }} />
                )}
                {failedH > 0 && (
                  <div className="w-full bg-red-500/70" style={{ height: `${failedH}%` }} />
                )}
                {d.total === 0 && (
                  <div className="w-full rounded-t-sm bg-surface-3" style={{ height: '4px' }} />
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div className="flex justify-between text-xs text-text-secondary mt-2">
        <span>{formatDate(data[0].date)}</span>
        <span>{formatDate(data[data.length - 1].date)}</span>
      </div>
      <div className="flex gap-4 mt-3 text-xs text-text-secondary">
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-green-500/70 inline-block" /> Success</span>
        <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-red-500/70 inline-block" /> Failed</span>
      </div>
    </div>
  );
}

// ─── Channel Reliability ──────────────────────────────────────────────────────

function ChannelReliability({ stats }: { stats: ChannelStat[] }) {
  if (stats.length === 0) return null;

  return (
    <div className="rounded-xl border border-border bg-surface-1 p-5">
      <h3 className="text-sm font-semibold text-text-primary mb-4">Channel Reliability</h3>
      <div className="space-y-3">
        {stats.map((ch) => (
          <div key={ch.channelId}>
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <span className="text-xs text-text-secondary uppercase">{ch.channelType}</span>
                <span className="text-sm font-medium text-text-primary">{ch.channelName}</span>
              </div>
              <div className="flex items-center gap-3 text-xs text-text-secondary">
                {ch.avgDurationMs !== null && <span>{ch.avgDurationMs}ms avg</span>}
                <span className={ch.successRate >= 99 ? 'text-green-400 font-semibold' : ch.successRate >= 90 ? 'text-yellow-400 font-semibold' : 'text-red-400 font-semibold'}>
                  {ch.successRate}%
                </span>
              </div>
            </div>
            <div className="h-1.5 rounded-full bg-surface-3 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${ch.successRate >= 99 ? 'bg-green-500' : ch.successRate >= 90 ? 'bg-yellow-500' : 'bg-red-500'}`}
                style={{ width: `${ch.successRate}%` }}
              />
            </div>
            <div className="flex items-center gap-3 mt-1 text-xs text-text-secondary">
              <span className="text-green-400">{ch.successCount} ok</span>
              {ch.failedCount > 0 && <span className="text-red-400">{ch.failedCount} failed</span>}
              <span>{ch.totalDeliveries} total</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Top Alerting Monitors ────────────────────────────────────────────────────

function TopMonitors({ monitors }: { monitors: TopMonitor[] }) {
  if (monitors.length === 0) return null;
  const max = monitors[0].count;

  return (
    <div className="rounded-xl border border-border bg-surface-1 p-5">
      <h3 className="text-sm font-semibold text-text-primary mb-4">Top Alerting Monitors <span className="text-text-secondary font-normal">(last 30d)</span></h3>
      <div className="space-y-3">
        {monitors.map((m, i) => (
          <div key={m.monitorId} className="flex items-center gap-3">
            <span className="text-xs text-text-secondary w-4 text-right tabular-nums">{i + 1}</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium text-text-primary truncate">{m.monitorName}</span>
                <div className="flex items-center gap-2 text-xs shrink-0 ml-2">
                  <span className="text-text-primary font-semibold tabular-nums">{m.count}</span>
                  {m.failed > 0 && <span className="text-red-400 tabular-nums">{m.failed} failed</span>}
                </div>
              </div>
              <div className="h-1.5 rounded-full bg-surface-3 overflow-hidden">
                <div className="h-full rounded-full bg-accent/70" style={{ width: `${(m.count / max) * 100}%` }} />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AlertAnalyticsPage() {
  const router = useRouter();
  const { error: toastError } = useToast();
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const user = getUser();
    if (!user) { router.push('/login'); return; }

    api<AnalyticsData>('/v1/alert-channels/analytics')
      .then(setData)
      .catch(() => toastError('Failed to load analytics'))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  const successRate = data && data.totals.total > 0
    ? Math.round((data.totals.success / data.totals.total) * 1000) / 10
    : null;

  const peakDay = data?.dailyCounts.reduce((a, b) => b.total > a.total ? b : a, data.dailyCounts[0]);

  return (
    <AppFrame
      title="Alert Analytics"
      subtitle="Delivery stats and trends for your alert channels"
      breadcrumbs={[
        { label: 'Alerts', href: '/alerts' },
        { label: 'Alert Analytics' },
      ]}
    >
      {loading ? (
        <div className="flex items-center justify-center py-20 text-text-secondary text-sm">Loading analytics…</div>
      ) : !data || data.totals.total === 0 ? (
        <div className="rounded-xl border border-border bg-surface-1 p-12 text-center">
          <Activity className="w-12 h-12 mx-auto text-text-secondary/40 mb-4" />
          <h3 className="text-lg font-semibold text-text-primary mb-2">No delivery data yet</h3>
          <p className="text-sm text-text-secondary max-w-sm mx-auto">
            Alert delivery analytics will appear here once your monitors start triggering notifications.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Summary Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <StatCard
              label="Total Deliveries"
              value={data.totals.total.toLocaleString()}
              sub="last 30 days"
            />
            <StatCard
              label="Success Rate"
              value={successRate !== null ? `${successRate}%` : '—'}
              color={successRate !== null ? (successRate >= 99 ? 'text-green-400' : successRate >= 90 ? 'text-yellow-400' : 'text-red-400') : undefined}
              sub={`${data.totals.success} ok / ${data.totals.failed} failed`}
            />
            <StatCard
              label="Active Channels"
              value={data.channelStats.length}
              sub="with recent deliveries"
            />
            <StatCard
              label="Peak Day"
              value={peakDay ? peakDay.total : 0}
              sub={peakDay ? formatDate(peakDay.date) : 'no data'}
            />
          </div>

          {/* Alert trend */}
          {data.dailyCounts.length > 0 && (
            <DailyBarChart data={data.dailyCounts} />
          )}

          {/* Two-column: channel stats + top monitors */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <ChannelReliability stats={data.channelStats} />
            <TopMonitors monitors={data.topMonitors} />
          </div>

          {/* Insight callout */}
          {data.totals.failed > 0 && (
            <div className="rounded-xl border border-yellow-500/20 bg-yellow-500/5 p-4 flex items-start gap-3">
              <AlertTriangle className="w-4 h-4 text-yellow-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-yellow-300">
                  {data.totals.failed} failed delivery{data.totals.failed !== 1 ? 'ies' : ''}
                </p>
                <p className="text-xs text-text-secondary mt-0.5">
                  Check your channel configurations and verify webhook URLs are reachable. Failed deliveries mean some alerts may have been missed.
                </p>
              </div>
            </div>
          )}

          {data.totals.total > 0 && data.totals.failed === 0 && (
            <div className="rounded-xl border border-green-500/20 bg-green-500/5 p-4 flex items-start gap-3">
              <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0 mt-0.5" />
              <p className="text-sm text-green-300">All {data.totals.total} alert deliveries were successful. Channels are healthy.</p>
            </div>
          )}
        </div>
      )}
    </AppFrame>
  );
}
