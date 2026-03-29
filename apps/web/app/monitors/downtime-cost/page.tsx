'use client';

import { useEffect, useState, useCallback } from 'react';
import { AppFrame } from '../../../components/app-frame';
import { api } from '../../../lib/api';
import { getUser } from '../../../components/auth';
import { AlertTriangle, Clock, DollarSign, TrendingDown, Zap } from 'lucide-react';

interface MonitorCostEntry {
  id: string;
  name: string;
  downtimeCostPerHour: number;
  downtimeMinutes: number;
  estimatedCost: number;
  incidentCount: number;
  worstIncidentCost: number;
}

interface CostReport {
  totalEstimatedCost: number;
  totalDowntimeMinutes: number;
  monitorCount: number;
  monitors: MonitorCostEntry[];
  currency: 'USD';
  periodDays: 30;
}

function formatMinutes(minutes: number): string {
  if (minutes === 0) return '0m';
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function formatUsd(amount: number): string {
  if (amount === 0) return '$0.00';
  if (amount < 0.01) return '<$0.01';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(amount);
}

function costColor(cost: number): string {
  if (cost === 0) return 'text-emerald-400';
  if (cost < 10) return 'text-emerald-400';
  if (cost < 100) return 'text-yellow-400';
  if (cost < 1000) return 'text-orange-400';
  return 'text-red-400';
}

function costBadgeClass(cost: number): string {
  if (cost === 0) return 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
  if (cost < 10) return 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
  if (cost < 100) return 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20';
  if (cost < 1000) return 'bg-orange-500/10 text-orange-400 border border-orange-500/20';
  return 'bg-red-500/10 text-red-400 border border-red-500/20';
}

export default function DowntimeCostPage() {
  const [report, setReport] = useState<CostReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      await getUser();
      const result = await api<CostReport>('/v1/monitors/downtime-cost-report');
      setReport(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load cost report');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const worstMonitor = report?.monitors.reduce<MonitorCostEntry | null>((worst, m) => {
    if (!worst || m.worstIncidentCost > worst.worstIncidentCost) return m;
    return worst;
  }, null);

  return (
    <AppFrame title="Cost Impact">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-white">Business Impact</h1>
          <p className="mt-1 text-sm text-white/50">
            Financial cost of downtime over the last 30 days — based on per-monitor hourly cost configuration.
          </p>
        </div>

        {loading && (
          <div className="flex items-center justify-center h-48">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white/40" />
          </div>
        )}

        {error && (
          <div className="flex items-center gap-3 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400">
            <AlertTriangle size={18} />
            <span className="text-sm">{error}</span>
          </div>
        )}

        {!loading && !error && report && (
          <>
            {/* Stat Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Total Estimated Cost */}
              <div className="relative overflow-hidden rounded-2xl bg-white/5 border border-white/10 p-5 backdrop-blur-sm">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-medium text-white/50 uppercase tracking-wider">Total Est. Cost</span>
                  <DollarSign size={16} className="text-white/30" />
                </div>
                <div className={`text-3xl font-bold ${costColor(report.totalEstimatedCost)}`}>
                  {formatUsd(report.totalEstimatedCost)}
                </div>
                <p className="mt-1 text-xs text-white/40">Last 30 days</p>
              </div>

              {/* Total Downtime */}
              <div className="relative overflow-hidden rounded-2xl bg-white/5 border border-white/10 p-5 backdrop-blur-sm">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-medium text-white/50 uppercase tracking-wider">Total Downtime</span>
                  <Clock size={16} className="text-white/30" />
                </div>
                <div className="text-3xl font-bold text-white">
                  {formatMinutes(report.totalDowntimeMinutes)}
                </div>
                <p className="mt-1 text-xs text-white/40">Across configured monitors</p>
              </div>

              {/* Monitors Configured */}
              <div className="relative overflow-hidden rounded-2xl bg-white/5 border border-white/10 p-5 backdrop-blur-sm">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-medium text-white/50 uppercase tracking-wider">Configured</span>
                  <TrendingDown size={16} className="text-white/30" />
                </div>
                <div className="text-3xl font-bold text-white">
                  {report.monitorCount}
                </div>
                <p className="mt-1 text-xs text-white/40">Monitors with cost tracking</p>
              </div>

              {/* Worst Incident */}
              <div className="relative overflow-hidden rounded-2xl bg-white/5 border border-white/10 p-5 backdrop-blur-sm">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs font-medium text-white/50 uppercase tracking-wider">Worst Incident</span>
                  <Zap size={16} className="text-white/30" />
                </div>
                <div className={`text-3xl font-bold ${costColor(worstMonitor?.worstIncidentCost ?? 0)}`}>
                  {formatUsd(worstMonitor?.worstIncidentCost ?? 0)}
                </div>
                {worstMonitor && worstMonitor.worstIncidentCost > 0 ? (
                  <p className="mt-1 text-xs text-white/40 truncate">{worstMonitor.name}</p>
                ) : (
                  <p className="mt-1 text-xs text-white/40">No incidents recorded</p>
                )}
              </div>
            </div>

            {/* Monitor Table */}
            {report.monitors.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <DollarSign size={48} className="text-white/10 mb-4" />
                <h3 className="text-lg font-semibold text-white/60 mb-2">No cost tracking configured</h3>
                <p className="text-sm text-white/40 max-w-md">
                  Configure hourly cost on monitors to track business impact. Edit any monitor and set the &quot;Downtime Cost / Hour&quot; field in Advanced Settings.
                </p>
              </div>
            ) : (
              <div className="rounded-2xl bg-white/5 border border-white/10 overflow-hidden backdrop-blur-sm">
                <div className="px-6 py-4 border-b border-white/10">
                  <h2 className="text-sm font-semibold text-white">Monitor Breakdown</h2>
                  <p className="text-xs text-white/40 mt-0.5">Last 30 days · All times UTC</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-white/5">
                        <th className="text-left px-6 py-3 text-xs font-medium text-white/40 uppercase tracking-wider">Monitor</th>
                        <th className="text-right px-4 py-3 text-xs font-medium text-white/40 uppercase tracking-wider">Cost/Hour</th>
                        <th className="text-right px-4 py-3 text-xs font-medium text-white/40 uppercase tracking-wider">Downtime</th>
                        <th className="text-right px-4 py-3 text-xs font-medium text-white/40 uppercase tracking-wider">Est. Cost</th>
                        <th className="text-right px-4 py-3 text-xs font-medium text-white/40 uppercase tracking-wider">Incidents</th>
                        <th className="text-right px-6 py-3 text-xs font-medium text-white/40 uppercase tracking-wider">Worst Incident</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                      {report.monitors
                        .slice()
                        .sort((a, b) => b.estimatedCost - a.estimatedCost)
                        .map((m) => (
                          <tr key={m.id} className="hover:bg-white/[0.03] transition-colors">
                            <td className="px-6 py-4">
                              <span className="font-medium text-white">{m.name}</span>
                            </td>
                            <td className="px-4 py-4 text-right text-white/60">
                              {formatUsd(m.downtimeCostPerHour)}/h
                            </td>
                            <td className="px-4 py-4 text-right text-white/60">
                              {formatMinutes(m.downtimeMinutes)}
                            </td>
                            <td className="px-4 py-4 text-right">
                              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${costBadgeClass(m.estimatedCost)}`}>
                                {formatUsd(m.estimatedCost)}
                              </span>
                            </td>
                            <td className="px-4 py-4 text-right text-white/60">
                              {m.incidentCount}
                            </td>
                            <td className="px-6 py-4 text-right">
                              {m.worstIncidentCost > 0 ? (
                                <span className={`text-sm font-medium ${costColor(m.worstIncidentCost)}`}>
                                  {formatUsd(m.worstIncidentCost)}
                                </span>
                              ) : (
                                <span className="text-white/30 text-sm">—</span>
                              )}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Info footer */}
            <p className="text-xs text-white/30 text-center">
              Cost estimates use failed check count × check interval to calculate downtime minutes. Actual outage duration may differ.
              Configure per-monitor hourly cost in monitor Advanced Settings.
            </p>
          </>
        )}
      </div>
    </AppFrame>
  );
}
