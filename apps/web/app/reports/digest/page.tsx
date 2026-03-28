'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AppFrame } from '../../../components/app-frame';
import { api } from '../../../lib/api';
import {
  Activity,
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Award,
  BookOpen,
  CheckCircle,
  Clock,
  Download,
  TrendingDown,
  TrendingUp,
  XCircle,
  Zap,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface DigestPerformer {
  id: string;
  name: string;
  type: string;
  uptimePct: number;
  avgLatencyMs: number | null;
}

interface DigestImprovement {
  id: string;
  name: string;
  uptimeDelta: number;
}

interface DigestRecommendation {
  severity: 'high' | 'medium' | 'low';
  title: string;
  description: string;
  monitorId?: string;
}

interface DigestTrendPoint {
  date: string;
  uptimePct: number | null;
}

interface DigestResult {
  period: number;
  generatedAt: string;
  fleet: {
    totalMonitors: number;
    uptimeMonitors: number;
    versionMonitors: number;
    overallUptimePct: number;
    overallGrade: string;
  };
  topPerformers: DigestPerformer[];
  worstPerformers: DigestPerformer[];
  mostImproved: DigestImprovement[];
  mostDegraded: DigestImprovement[];
  alerts: {
    totalFired: number;
    topNoisyMonitor: { name: string; count: number } | null;
    recoveryRate: number;
  };
  incidents: {
    total: number;
    resolved: number;
    avgResolutionMinutes: number | null;
  };
  checks: {
    totalRuns: number;
    successRuns: number;
    failedRuns: number;
    successRate: number;
  };
  versionUpdates: {
    monitored: number;
    upToDate: number;
    updateAvailable: number;
  };
  recommendations: DigestRecommendation[];
  uptimeTrend: DigestTrendPoint[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function gradeColor(grade: string): string {
  switch (grade) {
    case 'A': return 'text-green-400 border-green-400';
    case 'B': return 'text-blue-400 border-blue-400';
    case 'C': return 'text-yellow-400 border-yellow-400';
    case 'D': return 'text-orange-400 border-orange-400';
    default:  return 'text-red-400 border-red-400';
  }
}

function uptimeColor(pct: number): string {
  if (pct >= 99.9) return 'text-green-400';
  if (pct >= 99)   return 'text-blue-400';
  if (pct >= 95)   return 'text-yellow-400';
  if (pct >= 90)   return 'text-orange-400';
  return 'text-red-400';
}

function severityIcon(sev: DigestRecommendation['severity']): string {
  switch (sev) {
    case 'high':   return '🔴';
    case 'medium': return '🟡';
    default:       return '🟢';
  }
}

function formatLatency(ms: number | null): string {
  if (ms == null) return '—';
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
  return `${ms}ms`;
}

// ── SVG Trend Chart ───────────────────────────────────────────────────────────

function TrendChart({ points }: { points: DigestTrendPoint[] }) {
  const W = 800;
  const H = 120;
  const PAD = { top: 10, right: 20, bottom: 28, left: 36 };
  const chartW = W - PAD.left - PAD.right;
  const chartH = H - PAD.top - PAD.bottom;

  const validPoints = points.filter((p) => p.uptimePct != null);
  if (validPoints.length === 0) {
    return (
      <div className="flex items-center justify-center h-32 text-white/30 text-sm">
        No data yet
      </div>
    );
  }

  const n = points.length;
  const xScale = (i: number) => PAD.left + (i / (n - 1)) * chartW;
  const yScale = (v: number) => PAD.top + chartH - ((v - 80) / 20) * chartH;

  // Build polyline path (skip null points)
  const segments: string[] = [];
  let currentSegment: string[] = [];

  points.forEach((p, i) => {
    if (p.uptimePct == null) {
      if (currentSegment.length > 0) {
        segments.push(currentSegment.join(' L '));
        currentSegment = [];
      }
    } else {
      const x = xScale(i);
      const y = Math.max(PAD.top, Math.min(PAD.top + chartH, yScale(Math.max(80, Math.min(100, p.uptimePct)))));
      if (currentSegment.length === 0) {
        currentSegment.push(`M ${x} ${y}`);
      } else {
        currentSegment.push(`${x} ${y}`);
      }
    }
  });
  if (currentSegment.length > 0) segments.push(currentSegment.join(' L '));

  // Date labels (show ~5)
  const labelIndices = [0, Math.floor(n / 4), Math.floor(n / 2), Math.floor((3 * n) / 4), n - 1];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: '120px' }}>
      {/* Grid lines */}
      {[80, 85, 90, 95, 100].map((v) => {
        const y = yScale(v);
        return (
          <g key={v}>
            <line
              x1={PAD.left}
              y1={y}
              x2={W - PAD.right}
              y2={y}
              stroke="rgba(255,255,255,0.07)"
              strokeWidth="1"
            />
            <text x={PAD.left - 4} y={y + 4} fill="rgba(255,255,255,0.3)" fontSize="9" textAnchor="end">
              {v}%
            </text>
          </g>
        );
      })}

      {/* Date labels */}
      {labelIndices.map((i) => {
        const p = points[i];
        if (!p) return null;
        const x = xScale(i);
        const label = p.date.slice(5); // MM-DD
        return (
          <text key={i} x={x} y={H - 4} fill="rgba(255,255,255,0.3)" fontSize="9" textAnchor="middle">
            {label}
          </text>
        );
      })}

      {/* Line */}
      {segments.map((d, i) => (
        <path key={i} d={d} stroke="#4ade80" strokeWidth="2" fill="none" strokeLinejoin="round" strokeLinecap="round" />
      ))}

      {/* Dots for valid points */}
      {points.map((p, i) => {
        if (p.uptimePct == null) return null;
        const x = xScale(i);
        const yVal = Math.max(80, Math.min(100, p.uptimePct));
        const y = Math.max(PAD.top, Math.min(PAD.top + chartH, yScale(yVal)));
        return (
          <circle key={i} cx={x} cy={y} r="2.5" fill="#4ade80" opacity="0.8" />
        );
      })}
    </svg>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

const PERIODS = [7, 30, 90] as const;
type Period = (typeof PERIODS)[number];

export default function DigestPage() {
  const [period, setPeriod] = useState<Period>(7);
  const [digest, setDigest] = useState<DigestResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    api<DigestResult>(`/v1/reports/digest?period=${period}`)
      .then(setDigest)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [period]);

  return (
    <AppFrame title="Operations Digest">
      <style>{`@media print { .no-print { display: none !important; } body { background: white !important; color: black !important; } }`}</style>

      <div className="space-y-6 max-w-6xl mx-auto">

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 no-print">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              <BookOpen className="w-6 h-6 text-purple-400" />
              Operations Digest
            </h1>
            {digest && (
              <p className="text-white/40 text-sm mt-1">
                Generated {new Date(digest.generatedAt).toLocaleString()}
              </p>
            )}
          </div>
          <div className="flex items-center gap-3">
            {/* Period pills */}
            <div className="flex items-center gap-1 bg-white/5 border border-white/10 rounded-lg p-1">
              {PERIODS.map((p) => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    period === p
                      ? 'bg-purple-600 text-white'
                      : 'text-white/50 hover:text-white hover:bg-white/5'
                  }`}
                >
                  {p} Days
                </button>
              ))}
            </div>
            <button
              onClick={() => window.print()}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white/70 hover:text-white hover:bg-white/10 transition-colors text-sm no-print"
            >
              <Download className="w-4 h-4" />
              Export PDF
            </button>
          </div>
        </div>

        {/* ── Loading / Error ─────────────────────────────────────────────── */}
        {loading && (
          <div className="flex items-center justify-center h-64">
            <div className="w-8 h-8 border-2 border-white/20 border-t-purple-400 rounded-full animate-spin" />
          </div>
        )}

        {!loading && error && (
          <div className="flex flex-col items-center justify-center h-64 gap-3 text-white/50">
            <XCircle className="w-10 h-10 text-red-400" />
            <p>{error}</p>
          </div>
        )}

        {!loading && !error && digest && (
          <>
            {/* ── Grade Hero ─────────────────────────────────────────────── */}
            <div className={`bg-white/5 border rounded-xl p-8 flex flex-col sm:flex-row items-center gap-6 border-white/10`}>
              <div className={`rounded-full border-4 w-28 h-28 flex flex-col items-center justify-center font-bold shrink-0 ${gradeColor(digest.fleet.overallGrade)}`}>
                <span className="text-4xl">{digest.fleet.overallGrade}</span>
              </div>
              <div className="text-center sm:text-left">
                <p className="text-white/50 text-sm">Overall Fleet Health</p>
                <p className={`text-5xl font-bold mt-1 ${uptimeColor(digest.fleet.overallUptimePct)}`}>
                  {digest.fleet.overallUptimePct.toFixed(2)}%
                </p>
                <p className="text-white/40 text-sm mt-2">Last {period} days · {digest.fleet.uptimeMonitors} uptime monitors</p>
              </div>
            </div>

            {/* ── Stats Row ──────────────────────────────────────────────── */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { label: 'Total Monitors', value: digest.fleet.totalMonitors, icon: <Activity className="w-4 h-4" />, color: 'text-blue-400' },
                { label: 'Total Checks', value: digest.checks.totalRuns.toLocaleString(), icon: <CheckCircle className="w-4 h-4" />, color: 'text-green-400' },
                { label: 'Success Rate', value: `${digest.checks.successRate.toFixed(1)}%`, icon: <Zap className="w-4 h-4" />, color: 'text-purple-400' },
                { label: 'Active Incidents', value: digest.incidents.total - digest.incidents.resolved, icon: <AlertTriangle className="w-4 h-4" />, color: 'text-orange-400' },
              ].map((s) => (
                <div key={s.label} className="bg-white/5 border border-white/10 rounded-xl p-4">
                  <div className={`flex items-center gap-1.5 ${s.color} mb-1`}>
                    {s.icon}
                    <span className="text-xs font-medium">{s.label}</span>
                  </div>
                  <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
                </div>
              ))}
            </div>

            {/* ── Top / Worst Performers ─────────────────────────────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Top */}
              <div className="bg-white/5 border border-white/10 rounded-xl p-6">
                <div className="flex items-center gap-2 mb-4">
                  <Award className="w-4 h-4 text-green-400" />
                  <h2 className="font-semibold text-white">Top Performers</h2>
                </div>
                {digest.topPerformers.length === 0 ? (
                  <p className="text-white/40 text-sm py-4 text-center">No data yet</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-white/30 text-xs">
                        <th className="text-left pb-2 font-medium">Monitor</th>
                        <th className="text-left pb-2 font-medium">Type</th>
                        <th className="text-right pb-2 font-medium">Uptime</th>
                        <th className="text-right pb-2 font-medium">Latency</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {digest.topPerformers.map((m) => (
                        <tr key={m.id} className="hover:bg-white/5 transition-colors">
                          <td className="py-2">
                            <Link href={`/monitors/${m.id}`} className="text-white/80 hover:text-white transition-colors truncate max-w-[160px] block">
                              {m.name}
                            </Link>
                          </td>
                          <td className="py-2">
                            <span className="text-xs bg-blue-500/15 text-blue-400 border border-blue-500/25 px-1.5 py-0.5 rounded font-mono">
                              {m.type}
                            </span>
                          </td>
                          <td className={`py-2 text-right font-mono text-xs ${uptimeColor(m.uptimePct)}`}>
                            {m.uptimePct.toFixed(2)}%
                          </td>
                          <td className="py-2 text-right text-white/50 text-xs font-mono">
                            {formatLatency(m.avgLatencyMs)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              {/* Worst */}
              <div className="bg-white/5 border border-red-900/30 rounded-xl p-6">
                <div className="flex items-center gap-2 mb-4">
                  <TrendingDown className="w-4 h-4 text-red-400" />
                  <h2 className="font-semibold text-white">Worst Performers</h2>
                </div>
                {digest.worstPerformers.length === 0 ? (
                  <p className="text-white/40 text-sm py-4 text-center">No data yet</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-white/30 text-xs">
                        <th className="text-left pb-2 font-medium">Monitor</th>
                        <th className="text-left pb-2 font-medium">Type</th>
                        <th className="text-right pb-2 font-medium">Uptime</th>
                        <th className="text-right pb-2 font-medium">Latency</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {digest.worstPerformers.map((m) => (
                        <tr key={m.id} className="hover:bg-red-900/10 transition-colors">
                          <td className="py-2">
                            <Link href={`/monitors/${m.id}`} className="text-white/80 hover:text-white transition-colors truncate max-w-[160px] block">
                              {m.name}
                            </Link>
                          </td>
                          <td className="py-2">
                            <span className="text-xs bg-red-500/15 text-red-400 border border-red-500/25 px-1.5 py-0.5 rounded font-mono">
                              {m.type}
                            </span>
                          </td>
                          <td className={`py-2 text-right font-mono text-xs ${uptimeColor(m.uptimePct)}`}>
                            {m.uptimePct.toFixed(2)}%
                          </td>
                          <td className="py-2 text-right text-white/50 text-xs font-mono">
                            {formatLatency(m.avgLatencyMs)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            {/* ── Uptime Trend Chart ─────────────────────────────────────── */}
            <div className="bg-white/5 border border-white/10 rounded-xl p-6">
              <div className="flex items-center gap-2 mb-4">
                <TrendingUp className="w-4 h-4 text-green-400" />
                <h2 className="font-semibold text-white">Fleet Uptime Trend</h2>
                <span className="ml-auto text-xs text-white/30">Last {period} days</span>
              </div>
              <TrendChart points={digest.uptimeTrend} />
            </div>

            {/* ── Most Improved / Degraded ───────────────────────────────── */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Most Improved */}
              <div className="bg-white/5 border border-white/10 rounded-xl p-6">
                <div className="flex items-center gap-2 mb-4">
                  <ArrowUp className="w-4 h-4 text-green-400" />
                  <h2 className="font-semibold text-white">Most Improved</h2>
                  <span className="ml-auto text-xs text-white/30">vs prior {period}d</span>
                </div>
                {digest.mostImproved.length === 0 ? (
                  <p className="text-white/40 text-sm py-4 text-center">No comparative data yet</p>
                ) : (
                  <div className="space-y-3">
                    {digest.mostImproved.map((m) => (
                      <div key={m.id} className="flex items-center justify-between">
                        <Link href={`/monitors/${m.id}`} className="text-sm text-white/80 hover:text-white transition-colors truncate max-w-[200px]">
                          {m.name}
                        </Link>
                        <span className="flex items-center gap-1 text-green-400 text-sm font-semibold">
                          <ArrowUp className="w-3 h-3" />
                          +{m.uptimeDelta.toFixed(2)}%
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Most Degraded */}
              <div className="bg-white/5 border border-white/10 rounded-xl p-6">
                <div className="flex items-center gap-2 mb-4">
                  <ArrowDown className="w-4 h-4 text-red-400" />
                  <h2 className="font-semibold text-white">Most Degraded</h2>
                  <span className="ml-auto text-xs text-white/30">vs prior {period}d</span>
                </div>
                {digest.mostDegraded.length === 0 ? (
                  <p className="text-white/40 text-sm py-4 text-center">No degradation detected</p>
                ) : (
                  <div className="space-y-3">
                    {digest.mostDegraded.map((m) => (
                      <div key={m.id} className="flex items-center justify-between">
                        <Link href={`/monitors/${m.id}`} className="text-sm text-white/80 hover:text-white transition-colors truncate max-w-[200px]">
                          {m.name}
                        </Link>
                        <span className="flex items-center gap-1 text-red-400 text-sm font-semibold">
                          <ArrowDown className="w-3 h-3" />
                          {m.uptimeDelta.toFixed(2)}%
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* ── Alerts & Incidents ─────────────────────────────────────── */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {[
                {
                  label: 'Alerts Fired',
                  value: digest.alerts.totalFired,
                  sub: digest.alerts.topNoisyMonitor
                    ? `Noisiest: ${digest.alerts.topNoisyMonitor.name} (${digest.alerts.topNoisyMonitor.count})`
                    : 'No alerts fired',
                  icon: <Zap className="w-4 h-4" />,
                  color: 'text-yellow-400',
                },
                {
                  label: 'Recovery Rate',
                  value: `${digest.alerts.recoveryRate}%`,
                  sub: 'Alerts with recovery notification',
                  icon: <CheckCircle className="w-4 h-4" />,
                  color: 'text-green-400',
                },
                {
                  label: 'Avg Incident Resolution',
                  value: digest.incidents.avgResolutionMinutes != null
                    ? digest.incidents.avgResolutionMinutes >= 60
                      ? `${Math.round(digest.incidents.avgResolutionMinutes / 60)}h`
                      : `${digest.incidents.avgResolutionMinutes}m`
                    : '—',
                  sub: `${digest.incidents.resolved}/${digest.incidents.total} resolved`,
                  icon: <Clock className="w-4 h-4" />,
                  color: 'text-blue-400',
                },
              ].map((s) => (
                <div key={s.label} className="bg-white/5 border border-white/10 rounded-xl p-5">
                  <div className={`flex items-center gap-1.5 ${s.color} mb-2`}>
                    {s.icon}
                    <span className="text-xs font-medium">{s.label}</span>
                  </div>
                  <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
                  <p className="text-white/30 text-xs mt-1 truncate">{s.sub}</p>
                </div>
              ))}
            </div>

            {/* ── Recommendations ────────────────────────────────────────── */}
            {digest.recommendations.length > 0 && (
              <div className="bg-white/5 border border-white/10 rounded-xl p-6">
                <div className="flex items-center gap-2 mb-4">
                  <AlertTriangle className="w-4 h-4 text-orange-400" />
                  <h2 className="font-semibold text-white">Recommendations</h2>
                  <span className="ml-auto text-xs text-white/30">{digest.recommendations.length} items</span>
                </div>
                <div className="space-y-3">
                  {digest.recommendations.map((r, i) => (
                    <div key={i} className="flex items-start gap-3 p-3 rounded-lg border border-white/5 hover:bg-white/5 transition-colors">
                      <span className="text-lg shrink-0 mt-0.5">{severityIcon(r.severity)}</span>
                      <div className="min-w-0">
                        {r.monitorId ? (
                          <Link href={`/monitors/${r.monitorId}`} className="text-sm font-medium text-white hover:text-purple-300 transition-colors">
                            {r.title}
                          </Link>
                        ) : (
                          <p className="text-sm font-medium text-white">{r.title}</p>
                        )}
                        <p className="text-xs text-white/50 mt-0.5">{r.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Footer */}
            <p className="text-xs text-white/20 text-center pb-4">
              Operations Digest · {period}-day window · {new Date(digest.generatedAt).toLocaleString()}
            </p>
          </>
        )}
      </div>
    </AppFrame>
  );
}
