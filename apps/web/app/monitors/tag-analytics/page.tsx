'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { AppFrame } from '../../../components/app-frame';
import { api } from '../../../lib/api';
import { getUser } from '../../../components/auth';
import {
  AlertTriangle,
  Activity,
  CheckCircle,
  Clock,
  Hash,
  Tag,
  TrendingDown,
  XCircle,
} from 'lucide-react';

interface TagStat {
  tag: string;
  monitorCount: number;
  avgUptimePct: number;
  worstUptimePct: number;
  totalIncidents: number;
  avgLatencyMs: number | null;
  monitorsDown: number;
  health: 'healthy' | 'degraded' | 'critical';
}

interface TagAnalyticsResult {
  periodDays: number;
  tags: TagStat[];
}

type Period = '24h' | '7d' | '30d';

const PERIOD_OPTIONS: { label: string; value: Period; days: number }[] = [
  { label: '24h', value: '24h', days: 1 },
  { label: '7d', value: '7d', days: 7 },
  { label: '30d', value: '30d', days: 30 },
];

function healthColor(health: TagStat['health']): string {
  if (health === 'healthy') return 'text-emerald-400';
  if (health === 'degraded') return 'text-yellow-400';
  return 'text-red-400';
}

function healthBg(health: TagStat['health']): string {
  if (health === 'healthy') return 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400';
  if (health === 'degraded') return 'bg-yellow-500/10 border-yellow-500/20 text-yellow-400';
  return 'bg-red-500/10 border-red-500/20 text-red-400';
}

function uptimeColor(pct: number): string {
  if (pct > 99) return 'text-emerald-400';
  if (pct >= 95) return 'text-yellow-400';
  return 'text-red-400';
}

function formatLatency(ms: number | null): string {
  if (ms === null) return '—';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function HealthBadge({ health }: { health: TagStat['health'] }) {
  const icons = {
    healthy: <CheckCircle className="w-3 h-3" />,
    degraded: <AlertTriangle className="w-3 h-3" />,
    critical: <XCircle className="w-3 h-3" />,
  };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${healthBg(health)}`}>
      {icons[health]}
      {health.charAt(0).toUpperCase() + health.slice(1)}
    </span>
  );
}

function TagCard({ stat }: { stat: TagStat }) {
  const isUntagged = stat.tag === 'Untagged';

  return (
    <Link
      href={isUntagged ? '/monitors' : `/monitors?tag=${encodeURIComponent(stat.tag)}`}
      className={`block rounded-xl border p-5 transition-all duration-200 hover:scale-[1.01] hover:shadow-lg group ${
        isUntagged
          ? 'bg-white/3 border-white/10 hover:border-white/20'
          : 'bg-white/5 border-white/10 hover:border-indigo-500/40'
      }`}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-2 min-w-0">
          <div className={`p-1.5 rounded-lg ${isUntagged ? 'bg-white/10' : 'bg-indigo-500/10'}`}>
            {isUntagged ? (
              <Tag className="w-4 h-4 text-white/40" />
            ) : (
              <Hash className="w-4 h-4 text-indigo-400" />
            )}
          </div>
          <span className={`font-semibold truncate ${isUntagged ? 'text-white/50' : 'text-white'}`}>
            {stat.tag}
          </span>
        </div>
        <HealthBadge health={stat.health} />
      </div>

      {/* Uptime */}
      <div className="mb-4">
        <div className="flex items-baseline gap-1">
          <span className={`text-3xl font-bold tabular-nums ${uptimeColor(stat.avgUptimePct)}`}>
            {stat.avgUptimePct.toFixed(2)}%
          </span>
          <span className="text-xs text-white/40">avg uptime</span>
        </div>
        {stat.worstUptimePct < stat.avgUptimePct && (
          <div className="flex items-center gap-1 mt-1">
            <TrendingDown className="w-3 h-3 text-white/30" />
            <span className="text-xs text-white/40">
              worst: <span className={uptimeColor(stat.worstUptimePct)}>{stat.worstUptimePct.toFixed(2)}%</span>
            </span>
          </div>
        )}
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3 text-center">
        <div>
          <div className="text-lg font-semibold text-white/90">{stat.monitorCount}</div>
          <div className="text-xs text-white/40">monitors</div>
        </div>
        <div>
          <div className={`text-lg font-semibold ${stat.monitorsDown > 0 ? 'text-red-400' : 'text-white/90'}`}>
            {stat.monitorsDown}
          </div>
          <div className="text-xs text-white/40">down now</div>
        </div>
        <div>
          <div className="text-lg font-semibold text-white/90">{stat.totalIncidents}</div>
          <div className="text-xs text-white/40">incidents</div>
        </div>
      </div>

      {/* Latency */}
      {stat.avgLatencyMs !== null && (
        <div className="mt-3 pt-3 border-t border-white/5 flex items-center gap-1.5">
          <Clock className="w-3.5 h-3.5 text-white/30" />
          <span className="text-xs text-white/50">
            avg latency: <span className="text-white/70">{formatLatency(stat.avgLatencyMs)}</span>
          </span>
        </div>
      )}
    </Link>
  );
}

export default function TagAnalyticsPage() {
  const [data, setData] = useState<TagAnalyticsResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<Period>('7d');

  const load = useCallback(async (p: Period) => {
    const days = PERIOD_OPTIONS.find((o) => o.value === p)?.days ?? 7;
    try {
      setLoading(true);
      setError(null);
      await getUser();
      const result = await api<TagAnalyticsResult>(`/v1/monitors/tag-analytics?days=${days}`);
      setData(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load tag analytics');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(period); }, [load, period]);

  // Summary metrics
  const totalTags = data ? data.tags.filter((t) => t.tag !== 'Untagged').length : 0;
  const healthyTags = data ? data.tags.filter((t) => t.tag !== 'Untagged' && t.health === 'healthy').length : 0;
  const degradedCritical = data ? data.tags.filter((t) => t.tag !== 'Untagged' && (t.health === 'degraded' || t.health === 'critical')).length : 0;
  const totalMonitors = data ? data.tags.reduce((sum, t) => sum + (t.tag === 'Untagged' ? 0 : t.monitorCount), 0) : 0;
  const untaggedBucket = data?.tags.find((t) => t.tag === 'Untagged');
  const untaggedCount = untaggedBucket?.monitorCount ?? 0;

  return (
    <AppFrame title="Tag Analytics">
      <div className="p-6 max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5 mb-1">
              <Hash className="w-6 h-6 text-indigo-400" />
              <h1 className="text-2xl font-bold text-white">Tag Analytics</h1>
            </div>
            <p className="text-sm text-white/50">Health and uptime grouped by monitor tags</p>
          </div>

          {/* Period selector */}
          <div className="flex items-center gap-1 bg-white/5 rounded-xl p-1">
            {PERIOD_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setPeriod(opt.value)}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  period === opt.value
                    ? 'bg-indigo-600 text-white shadow'
                    : 'text-white/50 hover:text-white/80'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {/* Error */}
        {error && !loading && (
          <div className="rounded-xl bg-red-500/10 border border-red-500/20 p-4 text-red-400 text-sm">
            {error}
          </div>
        )}

        {/* Content */}
        {!loading && !error && data && (
          <>
            {/* Untagged warning */}
            {untaggedCount > 0 && (
              <div className="flex items-start gap-3 rounded-xl bg-yellow-500/10 border border-yellow-500/20 p-4">
                <AlertTriangle className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm text-yellow-300 font-medium">
                    {untaggedCount} monitor{untaggedCount > 1 ? 's' : ''} without tags
                  </p>
                  <p className="text-xs text-yellow-400/70 mt-0.5">
                    Add tags to your monitors to improve visibility and grouping in analytics.
                  </p>
                </div>
              </div>
            )}

            {/* Summary cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[
                { label: 'Total Tags', value: totalTags, icon: Hash, color: 'text-indigo-400', bg: 'bg-indigo-500/10' },
                { label: 'Healthy Tags', value: healthyTags, icon: CheckCircle, color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
                { label: 'Degraded / Critical', value: degradedCritical, icon: AlertTriangle, color: degradedCritical > 0 ? 'text-yellow-400' : 'text-white/40', bg: degradedCritical > 0 ? 'bg-yellow-500/10' : 'bg-white/5' },
                { label: 'Tagged Monitors', value: totalMonitors, icon: Activity, color: 'text-sky-400', bg: 'bg-sky-500/10' },
              ].map(({ label, value, icon: Icon, color, bg }) => (
                <div key={label} className="rounded-xl bg-white/5 border border-white/10 p-4">
                  <div className={`inline-flex p-2 rounded-lg ${bg} mb-3`}>
                    <Icon className={`w-4 h-4 ${color}`} />
                  </div>
                  <div className="text-2xl font-bold text-white">{value}</div>
                  <div className="text-xs text-white/50 mt-0.5">{label}</div>
                </div>
              ))}
            </div>

            {/* Empty state */}
            {data.tags.length === 0 && (
              <div className="text-center py-20 text-white/40">
                <Hash className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p className="text-lg font-medium">No monitors yet</p>
                <p className="text-sm mt-1">Create monitors and add tags to see analytics here.</p>
              </div>
            )}

            {/* Tag cards grid */}
            {data.tags.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {data.tags.map((stat) => (
                  <TagCard key={stat.tag} stat={stat} />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </AppFrame>
  );
}
