'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AppFrame } from '../../../components/app-frame';
import { api } from '../../../lib/api';
import {
  AlertTriangle,
  Activity,
  CheckCircle2,
  TrendingDown,
  TrendingUp,
  Zap,
  RefreshCw,
  Clock,
  ChevronDown,
  ChevronUp,
  Info,
  XCircle,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────

interface AnomalyDetail {
  type: string;
  description: string;
  currentValue: number | null;
  previousValue: number | null;
  changePct: number | null;
}

interface PeriodStats {
  uptimePct: number | null;
  avgLatencyMs: number | null;
  failureCount: number;
  totalChecks: number;
}

interface MonitorAnomaly {
  monitorId: string;
  monitorName: string;
  monitorType: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  anomalyTypes: string[];
  details: AnomalyDetail[];
  currentPeriod: PeriodStats;
  previousPeriod: PeriodStats;
}

interface AnomalyReport {
  generatedAt: string;
  periodHours: number;
  totalMonitors: number;
  anomaliesFound: number;
  anomalies: MonitorAnomaly[];
}

// ── Helpers ───────────────────────────────────────────────────────────────

const SEVERITY_CONFIG = {
  critical: {
    label: 'Critical',
    bg: 'bg-red-500/10',
    border: 'border-red-500/30',
    text: 'text-red-400',
    dot: 'bg-red-500',
    icon: XCircle,
  },
  high: {
    label: 'High',
    bg: 'bg-orange-500/10',
    border: 'border-orange-500/30',
    text: 'text-orange-400',
    dot: 'bg-orange-500',
    icon: AlertTriangle,
  },
  medium: {
    label: 'Medium',
    bg: 'bg-yellow-500/10',
    border: 'border-yellow-500/30',
    text: 'text-yellow-400',
    dot: 'bg-yellow-500',
    icon: Activity,
  },
  low: {
    label: 'Low',
    bg: 'bg-blue-500/10',
    border: 'border-blue-500/30',
    text: 'text-blue-400',
    dot: 'bg-blue-400',
    icon: Info,
  },
};

const ANOMALY_TYPE_LABELS: Record<string, { label: string; icon: React.ElementType; color: string }> = {
  uptime_regression: { label: 'Uptime Regression', icon: TrendingDown, color: 'text-red-400' },
  latency_regression: { label: 'Latency Spike', icon: TrendingUp, color: 'text-orange-400' },
  flapping: { label: 'Flapping', icon: Zap, color: 'text-yellow-400' },
  failure_burst: { label: 'Failure Burst', icon: AlertTriangle, color: 'text-orange-400' },
  recovered: { label: 'Recovered', icon: CheckCircle2, color: 'text-green-400' },
  latency_improvement: { label: 'Latency Improved', icon: TrendingDown, color: 'text-green-400' },
  currently_degraded: { label: 'Currently Degraded', icon: XCircle, color: 'text-red-400' },
};

function formatHours(h: number) {
  if (h === 24) return '24h';
  if (h === 48) return '48h';
  if (h === 168) return '7d';
  return `${h}h`;
}

function uptimeColor(pct: number | null) {
  if (pct === null) return 'text-zinc-500';
  if (pct >= 99) return 'text-green-400';
  if (pct >= 95) return 'text-yellow-400';
  return 'text-red-400';
}

function latencyColor(ms: number | null) {
  if (ms === null) return 'text-zinc-500';
  if (ms < 300) return 'text-green-400';
  if (ms < 1000) return 'text-yellow-400';
  return 'text-red-400';
}

// ── Component ─────────────────────────────────────────────────────────────

export default function AnomalyReportPage() {
  const [report, setReport] = useState<AnomalyReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [periodHours, setPeriodHours] = useState<24 | 48 | 168>(24);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [severityFilter, setSeverityFilter] = useState<string>('all');

  const load = async (h: 24 | 48 | 168) => {
    setLoading(true);
    setError(null);
    try {
      const data = await api<AnomalyReport>(`/v1/monitors/anomaly-report?hours=${h}`);
      setReport(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load anomaly report');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(periodHours);
  }, [periodHours]);

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const filteredAnomalies = report?.anomalies.filter((a) =>
    severityFilter === 'all' ? true : a.severity === severityFilter,
  ) ?? [];

  const counts = report
    ? {
        critical: report.anomalies.filter((a) => a.severity === 'critical').length,
        high: report.anomalies.filter((a) => a.severity === 'high').length,
        medium: report.anomalies.filter((a) => a.severity === 'medium').length,
        low: report.anomalies.filter((a) => a.severity === 'low').length,
      }
    : null;

  return (
    <AppFrame title="Anomaly Report">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Anomaly Report</h1>
          <p className="text-sm text-zinc-400 mt-1">
            Fleet-wide behavioral changes — uptime regressions, latency spikes, flapping, recoveries
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* Period pills */}
          {([24, 48, 168] as const).map((h) => (
            <button
              key={h}
              onClick={() => setPeriodHours(h)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                periodHours === h
                  ? 'bg-indigo-600 text-white'
                  : 'bg-zinc-800 text-zinc-400 hover:text-white'
              }`}
            >
              {formatHours(h)}
            </button>
          ))}
          <button
            onClick={() => load(periodHours)}
            disabled={loading}
            className="ml-2 p-2 rounded-lg bg-zinc-800 text-zinc-400 hover:text-white transition-colors disabled:opacity-50"
            title="Refresh"
          >
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 mb-6">
          {error}
        </div>
      )}

      {loading && !report && (
        <div className="flex items-center justify-center h-48 text-zinc-500">
          <RefreshCw size={20} className="animate-spin mr-2" /> Loading…
        </div>
      )}

      {report && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
            {(
              [
                { key: 'critical', label: 'Critical', color: 'text-red-400', bg: 'bg-red-500/10' },
                { key: 'high', label: 'High', color: 'text-orange-400', bg: 'bg-orange-500/10' },
                { key: 'medium', label: 'Medium', color: 'text-yellow-400', bg: 'bg-yellow-500/10' },
                { key: 'low', label: 'Low / Positive', color: 'text-blue-400', bg: 'bg-blue-500/10' },
              ] as const
            ).map(({ key, label, color, bg }) => (
              <button
                key={key}
                onClick={() => setSeverityFilter(severityFilter === key ? 'all' : key)}
                className={`rounded-xl p-4 border transition-colors text-left ${
                  severityFilter === key
                    ? `${bg} border-zinc-600`
                    : 'bg-zinc-900 border-zinc-800 hover:border-zinc-700'
                }`}
              >
                <div className={`text-2xl font-bold ${color}`}>{counts![key]}</div>
                <div className="text-xs text-zinc-400 mt-0.5">{label}</div>
              </button>
            ))}
          </div>

          {/* Meta row */}
          <div className="flex items-center gap-4 mb-4 text-sm text-zinc-500">
            <span>
              <span className="text-zinc-300 font-medium">{report.anomaliesFound}</span> anomalies across{' '}
              <span className="text-zinc-300 font-medium">{report.totalMonitors}</span> monitors
            </span>
            <span className="flex items-center gap-1">
              <Clock size={13} />
              Comparing last {formatHours(report.periodHours)} vs prior {formatHours(report.periodHours)}
            </span>
            <span>Generated {new Date(report.generatedAt).toLocaleTimeString()}</span>
            {severityFilter !== 'all' && (
              <button
                onClick={() => setSeverityFilter('all')}
                className="text-indigo-400 hover:text-indigo-300"
              >
                Clear filter
              </button>
            )}
          </div>

          {/* No anomalies state */}
          {filteredAnomalies.length === 0 && (
            <div className="flex flex-col items-center justify-center h-48 rounded-xl bg-zinc-900 border border-zinc-800">
              <CheckCircle2 size={32} className="text-green-400 mb-3" />
              <p className="text-white font-medium">
                {severityFilter === 'all' ? 'No anomalies detected' : `No ${severityFilter} anomalies`}
              </p>
              <p className="text-sm text-zinc-500 mt-1">
                All monitors are behaving normally in the last {formatHours(report.periodHours)}
              </p>
            </div>
          )}

          {/* Anomaly list */}
          <div className="space-y-3">
            {filteredAnomalies.map((anomaly) => {
              const cfg = SEVERITY_CONFIG[anomaly.severity];
              const isExpanded = expanded.has(anomaly.monitorId);

              return (
                <div
                  key={anomaly.monitorId}
                  className={`rounded-xl border ${cfg.border} ${cfg.bg} overflow-hidden`}
                >
                  {/* Row header */}
                  <button
                    className="w-full flex items-center gap-3 p-4 text-left hover:bg-white/5 transition-colors"
                    onClick={() => toggleExpand(anomaly.monitorId)}
                  >
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${cfg.dot}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Link
                          href={`/monitors/${anomaly.monitorId}`}
                          className="text-white font-medium hover:text-indigo-300 transition-colors"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {anomaly.monitorName}
                        </Link>
                        <span className="text-xs text-zinc-500 bg-zinc-800 px-2 py-0.5 rounded-full">
                          {anomaly.monitorType}
                        </span>
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${cfg.bg} ${cfg.text} border ${cfg.border}`}>
                          {cfg.label}
                        </span>
                        {/* Anomaly type badges */}
                        {anomaly.anomalyTypes.map((t) => {
                          const at = ANOMALY_TYPE_LABELS[t];
                          if (!at) return null;
                          const Icon = at.icon;
                          return (
                            <span key={t} className={`flex items-center gap-1 text-xs ${at.color}`}>
                              <Icon size={12} />
                              {at.label}
                            </span>
                          );
                        })}
                      </div>
                      {/* Quick summary line */}
                      <p className="text-xs text-zinc-400 mt-1 truncate">
                        {anomaly.details[0]?.description}
                        {anomaly.details.length > 1 && ` +${anomaly.details.length - 1} more`}
                      </p>
                    </div>
                    {/* Period stats mini */}
                    <div className="hidden sm:flex items-center gap-6 text-xs mr-2">
                      <div className="text-right">
                        <div className={`font-mono font-bold ${uptimeColor(anomaly.currentPeriod.uptimePct)}`}>
                          {anomaly.currentPeriod.uptimePct !== null ? `${anomaly.currentPeriod.uptimePct}%` : '—'}
                        </div>
                        <div className="text-zinc-500">uptime</div>
                      </div>
                      <div className="text-right">
                        <div className={`font-mono font-bold ${latencyColor(anomaly.currentPeriod.avgLatencyMs)}`}>
                          {anomaly.currentPeriod.avgLatencyMs !== null ? `${anomaly.currentPeriod.avgLatencyMs}ms` : '—'}
                        </div>
                        <div className="text-zinc-500">avg latency</div>
                      </div>
                    </div>
                    {isExpanded ? (
                      <ChevronUp size={16} className="flex-shrink-0 text-zinc-500" />
                    ) : (
                      <ChevronDown size={16} className="flex-shrink-0 text-zinc-500" />
                    )}
                  </button>

                  {/* Expanded details */}
                  {isExpanded && (
                    <div className="border-t border-zinc-800/60 p-4 space-y-4">
                      {/* Period comparison */}
                      <div className="grid grid-cols-2 gap-4">
                        {(
                          [
                            { label: `Current (last ${formatHours(report.periodHours)})`, stats: anomaly.currentPeriod },
                            { label: `Previous (prior ${formatHours(report.periodHours)})`, stats: anomaly.previousPeriod },
                          ] as const
                        ).map(({ label, stats }) => (
                          <div key={label} className="bg-zinc-900/60 rounded-lg p-3">
                            <div className="text-xs text-zinc-500 mb-2">{label}</div>
                            <div className="grid grid-cols-2 gap-2 text-xs">
                              <div>
                                <div className={`font-mono font-bold text-sm ${uptimeColor(stats.uptimePct)}`}>
                                  {stats.uptimePct !== null ? `${stats.uptimePct}%` : '—'}
                                </div>
                                <div className="text-zinc-500">Uptime</div>
                              </div>
                              <div>
                                <div className={`font-mono font-bold text-sm ${latencyColor(stats.avgLatencyMs)}`}>
                                  {stats.avgLatencyMs !== null ? `${stats.avgLatencyMs}ms` : '—'}
                                </div>
                                <div className="text-zinc-500">Avg Latency</div>
                              </div>
                              <div>
                                <div className="font-mono font-bold text-sm text-red-400">{stats.failureCount}</div>
                                <div className="text-zinc-500">Failures</div>
                              </div>
                              <div>
                                <div className="font-mono font-bold text-sm text-zinc-300">{stats.totalChecks}</div>
                                <div className="text-zinc-500">Total Checks</div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Detail bullets */}
                      <div>
                        <div className="text-xs text-zinc-500 mb-2 font-medium uppercase tracking-wider">Detected Changes</div>
                        <div className="space-y-2">
                          {anomaly.details.map((detail, i) => {
                            const at = ANOMALY_TYPE_LABELS[detail.type];
                            const Icon = at?.icon ?? Activity;
                            const color = at?.color ?? 'text-zinc-400';
                            return (
                              <div key={i} className="flex items-start gap-2 text-sm">
                                <Icon size={14} className={`${color} flex-shrink-0 mt-0.5`} />
                                <span className="text-zinc-300">{detail.description}</span>
                                {detail.changePct !== null && (
                                  <span
                                    className={`ml-auto text-xs font-mono flex-shrink-0 ${
                                      detail.changePct > 0 ? 'text-red-400' : 'text-green-400'
                                    }`}
                                  >
                                    {detail.changePct > 0 ? '+' : ''}
                                    {detail.changePct.toFixed(1)}%
                                  </span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* Action link */}
                      <div className="flex justify-end">
                        <Link
                          href={`/monitors/${anomaly.monitorId}`}
                          className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
                        >
                          View monitor details →
                        </Link>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </AppFrame>
  );
}
