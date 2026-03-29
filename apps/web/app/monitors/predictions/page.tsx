'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { AppFrame } from '../../../components/app-frame';
import { api } from '../../../lib/api';
import {
  Brain,
  RefreshCw,
  TrendingDown,
  TrendingUp,
  ChevronUp,
  ChevronDown,
  AlertTriangle,
  CheckCircle2,
  Eye,
  Zap,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────

type PredictionLabel = 'stable' | 'watch' | 'at_risk' | 'likely_failure';

interface MonitorPrediction {
  monitorId: string;
  monitorName: string;
  monitorType: string;
  currentUptimePct: number;
  currentAvgLatencyMs: number | null;
  riskScore: number;
  prediction: PredictionLabel;
  estimatedHoursToFailure: number | null;
  trend: {
    uptimeSlopePctPerDay: number;
    latencySlopeMsPerDay: number | null;
  };
  lastCheckOk: boolean | null;
  checkCount: number;
}

interface PredictionSummary {
  total: number;
  stable: number;
  watch: number;
  atRisk: number;
  likelyFailure: number;
  avgFleetRisk: number;
}

interface PredictionResponse {
  predictions: MonitorPrediction[];
  summary: PredictionSummary;
}

// ── Config ────────────────────────────────────────────────────────────────

const PREDICTION_CONFIG: Record<
  PredictionLabel,
  { label: string; bg: string; border: string; text: string; dot: string; icon: React.ElementType }
> = {
  likely_failure: {
    label: 'LIKELY FAILURE',
    bg: 'bg-red-500/10',
    border: 'border-red-500/30',
    text: 'text-red-400',
    dot: 'bg-red-500',
    icon: AlertTriangle,
  },
  at_risk: {
    label: 'AT RISK',
    bg: 'bg-orange-500/10',
    border: 'border-orange-500/30',
    text: 'text-orange-400',
    dot: 'bg-orange-500',
    icon: Zap,
  },
  watch: {
    label: 'WATCH',
    bg: 'bg-yellow-500/10',
    border: 'border-yellow-500/30',
    text: 'text-yellow-400',
    dot: 'bg-yellow-500',
    icon: Eye,
  },
  stable: {
    label: 'STABLE',
    bg: 'bg-green-500/10',
    border: 'border-green-500/30',
    text: 'text-green-400',
    dot: 'bg-green-500',
    icon: CheckCircle2,
  },
};

// ── Helpers ───────────────────────────────────────────────────────────────

function riskColor(score: number): string {
  if (score < 15) return 'bg-green-500';
  if (score <= 35) return 'bg-yellow-500';
  if (score <= 60) return 'bg-orange-500';
  return 'bg-red-500';
}

function riskTextColor(score: number): string {
  if (score < 15) return 'text-green-400';
  if (score <= 35) return 'text-yellow-400';
  if (score <= 60) return 'text-orange-400';
  return 'text-red-400';
}

function fleetRiskColor(score: number): string {
  if (score < 15) return 'text-green-400';
  if (score <= 35) return 'text-yellow-400';
  if (score <= 60) return 'text-orange-400';
  return 'text-red-400';
}

function formatSlope(slope: number, unit: string): React.ReactNode {
  const isUp = slope > 0;
  const isDown = slope < 0;
  const formatted = `${isUp ? '+' : ''}${slope.toFixed(2)}${unit}`;
  if (isDown && unit === '%/day')
    return (
      <span className="flex items-center gap-0.5 text-red-400">
        <TrendingDown size={12} />
        {formatted}
      </span>
    );
  if (isUp && unit === '%/day')
    return (
      <span className="flex items-center gap-0.5 text-green-400">
        <TrendingUp size={12} />
        {formatted}
      </span>
    );
  if (isUp && unit === 'ms/day')
    return (
      <span className="flex items-center gap-0.5 text-red-400">
        <TrendingUp size={12} />
        {formatted}
      </span>
    );
  if (isDown && unit === 'ms/day')
    return (
      <span className="flex items-center gap-0.5 text-green-400">
        <TrendingDown size={12} />
        {formatted}
      </span>
    );
  return <span className="text-zinc-500">±0{unit}</span>;
}

// ── Component ─────────────────────────────────────────────────────────────

type SortKey = 'riskScore' | 'currentUptimePct' | 'monitorName' | 'estimatedHoursToFailure';

export default function PredictionsPage() {
  const [data, setData] = useState<PredictionResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterLabel, setFilterLabel] = useState<PredictionLabel | 'all'>('all');
  const [sortKey, setSortKey] = useState<SortKey>('riskScore');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api<PredictionResponse>('/v1/monitors/failure-prediction');
      setData(result);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load failure predictions');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  const filtered = (data?.predictions ?? [])
    .filter((p) => (filterLabel === 'all' ? true : p.prediction === filterLabel))
    .slice()
    .sort((a, b) => {
      let va: number | string;
      let vb: number | string;
      if (sortKey === 'riskScore') { va = a.riskScore; vb = b.riskScore; }
      else if (sortKey === 'currentUptimePct') { va = a.currentUptimePct; vb = b.currentUptimePct; }
      else if (sortKey === 'estimatedHoursToFailure') {
        va = a.estimatedHoursToFailure ?? 9999;
        vb = b.estimatedHoursToFailure ?? 9999;
      } else { va = a.monitorName.toLowerCase(); vb = b.monitorName.toLowerCase(); }
      if (va < vb) return sortDir === 'asc' ? -1 : 1;
      if (va > vb) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });

  const SortIcon = ({ k }: { k: SortKey }) =>
    sortKey === k ? (
      sortDir === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />
    ) : null;

  return (
    <AppFrame title="Failure Predictions">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Brain size={22} className="text-indigo-400" />
            <h1 className="text-2xl font-bold text-white">Failure Predictions</h1>
          </div>
          <p className="text-sm text-zinc-400">
            AI-powered trend analysis predicting monitor failures before they occur
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="p-2 rounded-lg bg-zinc-800 text-zinc-400 hover:text-white transition-colors disabled:opacity-50"
          title="Refresh"
        >
          <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 mb-6">
          {error}
        </div>
      )}

      {loading && !data && (
        <div className="flex items-center justify-center h-48 text-zinc-500">
          <RefreshCw size={20} className="animate-spin mr-2" /> Analyzing trends…
        </div>
      )}

      {data && (
        <>
          {/* Summary stat cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
            {(
              [
                { key: 'likely_failure' as const, count: data.summary.likelyFailure, label: 'Likely Failure', color: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/20' },
                { key: 'at_risk' as const, count: data.summary.atRisk, label: 'At Risk', color: 'text-orange-400', bg: 'bg-orange-500/10', border: 'border-orange-500/20' },
                { key: 'watch' as const, count: data.summary.watch, label: 'Watch', color: 'text-yellow-400', bg: 'bg-yellow-500/10', border: 'border-yellow-500/20' },
                { key: 'stable' as const, count: data.summary.stable, label: 'Stable', color: 'text-green-400', bg: 'bg-green-500/10', border: 'border-green-500/20' },
              ] as const
            ).map(({ key, count, label, color, bg, border }) => (
              <button
                key={key}
                onClick={() => setFilterLabel(filterLabel === key ? 'all' : key)}
                className={`rounded-xl p-4 border transition-all text-left ${
                  filterLabel === key ? `${bg} ${border}` : 'bg-zinc-900 border-zinc-800 hover:border-zinc-700'
                }`}
              >
                <div className={`text-2xl font-bold ${color}`}>{count}</div>
                <div className="text-xs text-zinc-400 mt-0.5">{label}</div>
              </button>
            ))}
          </div>

          {/* Fleet Risk Score */}
          <div className="rounded-xl bg-zinc-900 border border-zinc-800 p-4 mb-6 flex items-center gap-4">
            <div className="flex-1">
              <div className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Fleet Risk Score</div>
              <div className={`text-3xl font-bold ${fleetRiskColor(data.summary.avgFleetRisk)}`}>
                {data.summary.avgFleetRisk}
                <span className="text-sm text-zinc-500 font-normal ml-1">/ 100</span>
              </div>
            </div>
            <div className="flex-1">
              <div className="h-2 rounded-full bg-zinc-800 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${riskColor(data.summary.avgFleetRisk)}`}
                  style={{ width: `${data.summary.avgFleetRisk}%` }}
                />
              </div>
              <div className="text-xs text-zinc-500 mt-1">
                {data.summary.total} monitor{data.summary.total !== 1 ? 's' : ''} analyzed
              </div>
            </div>
            {filterLabel !== 'all' && (
              <button
                onClick={() => setFilterLabel('all')}
                className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors whitespace-nowrap"
              >
                Clear filter ×
              </button>
            )}
          </div>

          {/* Predictions table */}
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 rounded-xl bg-zinc-900 border border-zinc-800">
              <CheckCircle2 size={32} className="text-green-400 mb-3" />
              <p className="text-white font-medium">
                {filterLabel === 'all' ? 'No monitors to analyze' : `No ${filterLabel.replace('_', ' ')} monitors`}
              </p>
              <p className="text-sm text-zinc-500 mt-1">
                {filterLabel === 'all'
                  ? 'Enable monitors with at least 10 recent checks to see predictions'
                  : 'All monitors are in a better state'}
              </p>
            </div>
          ) : (
            <div className="rounded-xl bg-zinc-900 border border-zinc-800 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-zinc-800 text-xs text-zinc-500 uppercase tracking-wider">
                      <th className="text-left px-4 py-3">
                        <button
                          onClick={() => handleSort('monitorName')}
                          className="flex items-center gap-1 hover:text-zinc-300 transition-colors"
                        >
                          Monitor <SortIcon k="monitorName" />
                        </button>
                      </th>
                      <th className="text-left px-4 py-3">
                        <button
                          onClick={() => handleSort('riskScore')}
                          className="flex items-center gap-1 hover:text-zinc-300 transition-colors"
                        >
                          Risk Score <SortIcon k="riskScore" />
                        </button>
                      </th>
                      <th className="text-left px-4 py-3">Prediction</th>
                      <th className="text-left px-4 py-3">
                        <button
                          onClick={() => handleSort('currentUptimePct')}
                          className="flex items-center gap-1 hover:text-zinc-300 transition-colors"
                        >
                          Uptime 7d <SortIcon k="currentUptimePct" />
                        </button>
                      </th>
                      <th className="text-left px-4 py-3">Uptime Slope</th>
                      <th className="text-left px-4 py-3">Latency Slope</th>
                      <th className="text-left px-4 py-3">
                        <button
                          onClick={() => handleSort('estimatedHoursToFailure')}
                          className="flex items-center gap-1 hover:text-zinc-300 transition-colors"
                        >
                          Est. Failure <SortIcon k="estimatedHoursToFailure" />
                        </button>
                      </th>
                      <th className="text-left px-4 py-3">Last Check</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((pred) => {
                      const cfg = PREDICTION_CONFIG[pred.prediction];
                      const PredIcon = cfg.icon;

                      return (
                        <tr
                          key={pred.monitorId}
                          className="border-b border-zinc-800/50 last:border-0 hover:bg-zinc-800/30 transition-colors"
                        >
                          {/* Monitor name */}
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${cfg.dot}`} />
                              <div>
                                <Link
                                  href={`/monitors/${pred.monitorId}`}
                                  className="text-white font-medium hover:text-indigo-300 transition-colors"
                                >
                                  {pred.monitorName}
                                </Link>
                                <div className="text-xs text-zinc-500 bg-zinc-800 px-1.5 py-0.5 rounded mt-0.5 inline-block">
                                  {pred.monitorType}
                                </div>
                              </div>
                            </div>
                          </td>

                          {/* Risk score */}
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2 min-w-[100px]">
                              <div className="flex-1 h-1.5 rounded-full bg-zinc-800 overflow-hidden">
                                <div
                                  className={`h-full rounded-full ${riskColor(pred.riskScore)}`}
                                  style={{ width: `${pred.riskScore}%` }}
                                />
                              </div>
                              <span className={`text-xs font-mono font-bold w-6 text-right ${riskTextColor(pred.riskScore)}`}>
                                {pred.riskScore}
                              </span>
                            </div>
                          </td>

                          {/* Prediction badge */}
                          <td className="px-4 py-3">
                            <span
                              className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${cfg.bg} ${cfg.text} border ${cfg.border}`}
                            >
                              <PredIcon size={10} />
                              {cfg.label}
                            </span>
                          </td>

                          {/* Uptime 7d */}
                          <td className="px-4 py-3">
                            <span
                              className={`font-mono text-sm ${
                                pred.currentUptimePct >= 99
                                  ? 'text-green-400'
                                  : pred.currentUptimePct >= 95
                                  ? 'text-yellow-400'
                                  : 'text-red-400'
                              }`}
                            >
                              {pred.currentUptimePct.toFixed(1)}%
                            </span>
                          </td>

                          {/* Uptime slope */}
                          <td className="px-4 py-3 font-mono text-xs">
                            {formatSlope(pred.trend.uptimeSlopePctPerDay, '%/day')}
                          </td>

                          {/* Latency slope */}
                          <td className="px-4 py-3 font-mono text-xs">
                            {pred.trend.latencySlopeMsPerDay !== null
                              ? formatSlope(pred.trend.latencySlopeMsPerDay, 'ms/day')
                              : <span className="text-zinc-600">—</span>}
                          </td>

                          {/* Estimated hours to failure */}
                          <td className="px-4 py-3">
                            {pred.estimatedHoursToFailure !== null ? (
                              <span className="inline-flex items-center gap-1 text-red-400 font-mono text-sm font-medium animate-pulse">
                                ~{pred.estimatedHoursToFailure}h
                              </span>
                            ) : (
                              <span className="text-zinc-600">—</span>
                            )}
                          </td>

                          {/* Last check */}
                          <td className="px-4 py-3">
                            {pred.lastCheckOk === null ? (
                              <span className="w-2.5 h-2.5 rounded-full bg-zinc-600 inline-block" />
                            ) : pred.lastCheckOk ? (
                              <span className="w-2.5 h-2.5 rounded-full bg-green-500 inline-block" title="Last check OK" />
                            ) : (
                              <span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block animate-pulse" title="Last check failed" />
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </AppFrame>
  );
}
