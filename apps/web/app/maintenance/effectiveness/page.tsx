'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarClock, CheckCircle, AlertTriangle, HelpCircle, RefreshCw, Shield, TrendingDown, Clock, Bell } from 'lucide-react';
import { AppFrame } from '../../../components/app-frame';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { getUser } from '../../../components/auth';
import { api } from '../../../lib/api';
import { useToast } from '../../../components/ui/toast';

type WindowEffectiveness = {
  id: string;
  name: string;
  description: string | null;
  startsAt: string;
  endsAt: string;
  durationMinutes: number;
  monitorIds: string[];
  monitorNames: string[];
  checksInWindow: number;
  failuresInWindow: number;
  windowFailurePct: number;
  checksInBaseline: number;
  failuresInBaseline: number;
  baselineFailurePct: number;
  suppressedAlerts: number;
  recoveredAfterMinutes: number | null;
  status: 'effective' | 'over-active' | 'no-data';
};

type EffectivenessData = {
  period: { days: number; since: string };
  summary: {
    totalWindows: number;
    avgDurationMinutes: number;
    totalSuppressedAlerts: number;
    avgBaselineFailurePct: number;
    avgWindowFailurePct: number;
    noiseReductionPct: number;
  };
  windows: WindowEffectiveness[];
};

const STATUS_CONFIG = {
  effective: { label: 'Effective', icon: CheckCircle, color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30' },
  'over-active': { label: 'Over-scheduled', icon: AlertTriangle, color: 'text-yellow-400', bg: 'bg-yellow-500/10', border: 'border-yellow-500/30' },
  'no-data': { label: 'No data', icon: HelpCircle, color: 'text-zinc-400', bg: 'bg-zinc-700/30', border: 'border-zinc-600' },
};

function formatDuration(min: number): string {
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
}

function FailureBar({ pct, color }: { pct: number; color: string }) {
  return (
    <div className="flex items-center gap-2 min-w-0">
      <div className="flex-1 bg-zinc-800 rounded-full h-1.5 min-w-0">
        <div className={`h-1.5 rounded-full ${color}`} style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
      <span className="text-xs text-zinc-400 w-8 text-right shrink-0">{pct}%</span>
    </div>
  );
}

export default function MaintenanceEffectivenessPage() {
  const router = useRouter();
  const { error: showError } = useToast();
  const [data, setData] = useState<EffectivenessData | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState(90);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    const user = getUser();
    if (!user) { router.replace('/login'); return; }
    setLoading(true);
    api<EffectivenessData>(`/v1/maintenance/effectiveness?days=${period}`, user.id)
      .then(setData)
      .catch(() => showError('Failed to load maintenance effectiveness'))
      .finally(() => setLoading(false));
  }, [period]);

  function toggleExpand(id: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  const effective = data?.windows.filter(w => w.status === 'effective').length ?? 0;
  const overActive = data?.windows.filter(w => w.status === 'over-active').length ?? 0;
  const noData = data?.windows.filter(w => w.status === 'no-data').length ?? 0;

  return (
    <AppFrame title="Maintenance Effectiveness">
      <div className="p-6 max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400">
              <CalendarClock className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">Maintenance Effectiveness</h1>
              <p className="text-sm text-zinc-400">Analyze how your maintenance windows impacted monitor health</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {[30, 90, 180, 365].map(d => (
              <Button key={d} variant={period === d ? 'primary' : 'ghost'} size="sm" onClick={() => setPeriod(d)}>
                {d}d
              </Button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-24 text-zinc-500">
            <RefreshCw className="w-6 h-6 animate-spin mr-2" />
            Analyzing maintenance windows...
          </div>
        ) : !data ? null : (
          <>
            {/* Summary Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
              <Card className="p-4">
                <p className="text-xs text-zinc-400 uppercase tracking-wide">Windows</p>
                <p className="text-2xl font-bold text-white mt-1">{data.summary.totalWindows}</p>
              </Card>
              <Card className="p-4">
                <p className="text-xs text-zinc-400 uppercase tracking-wide flex items-center gap-1">
                  <CheckCircle className="w-3 h-3 text-emerald-400" /> Effective
                </p>
                <p className="text-2xl font-bold text-emerald-400 mt-1">{effective}</p>
              </Card>
              <Card className="p-4">
                <p className="text-xs text-zinc-400 uppercase tracking-wide flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3 text-yellow-400" /> Over-scheduled
                </p>
                <p className="text-2xl font-bold text-yellow-400 mt-1">{overActive}</p>
              </Card>
              <Card className="p-4">
                <p className="text-xs text-zinc-400 uppercase tracking-wide flex items-center gap-1">
                  <Bell className="w-3 h-3 text-blue-400" /> Suppressed
                </p>
                <p className="text-2xl font-bold text-blue-400 mt-1">{data.summary.totalSuppressedAlerts}</p>
              </Card>
              <Card className="p-4">
                <p className="text-xs text-zinc-400 uppercase tracking-wide flex items-center gap-1">
                  <Clock className="w-3 h-3" /> Avg Duration
                </p>
                <p className="text-2xl font-bold text-white mt-1">{formatDuration(data.summary.avgDurationMinutes)}</p>
              </Card>
              <Card className="p-4">
                <p className="text-xs text-zinc-400 uppercase tracking-wide flex items-center gap-1">
                  <TrendingDown className="w-3 h-3 text-emerald-400" /> Noise ↓
                </p>
                <p className="text-2xl font-bold text-emerald-400 mt-1">{data.summary.noiseReductionPct}%</p>
              </Card>
            </div>

            {/* Windows List */}
            {data.windows.length === 0 ? (
              <Card className="p-12 text-center">
                <CalendarClock className="w-12 h-12 text-zinc-600 mx-auto mb-4" />
                <p className="text-zinc-400 text-lg font-medium">No completed maintenance windows</p>
                <p className="text-zinc-500 text-sm mt-1">
                  Completed one-shot maintenance windows from the last {period} days will appear here.
                </p>
                <Button variant="primary" className="mt-4" onClick={() => router.push('/maintenance')}>
                  Schedule Maintenance
                </Button>
              </Card>
            ) : (
              <div className="space-y-3">
                {data.windows.map(w => {
                  const cfg = STATUS_CONFIG[w.status];
                  const StatusIcon = cfg.icon;
                  const isOpen = expanded.has(w.id);
                  return (
                    <Card key={w.id} className={`border ${cfg.border}`}>
                      <button
                        className="w-full text-left p-4"
                        onClick={() => toggleExpand(w.id)}
                      >
                        <div className="flex items-start gap-3">
                          <div className={`mt-0.5 p-1.5 rounded-lg ${cfg.bg}`}>
                            <StatusIcon className={`w-4 h-4 ${cfg.color}`} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-semibold text-zinc-200 truncate">{w.name}</span>
                              <span className={`text-xs px-2 py-0.5 rounded-full ${cfg.bg} ${cfg.color}`}>{cfg.label}</span>
                              <span className="text-xs text-zinc-500">{formatDuration(w.durationMinutes)}</span>
                            </div>
                            <p className="text-xs text-zinc-500 mt-0.5">
                              {formatDate(w.startsAt)} → {formatDate(w.endsAt)}
                              {w.monitorNames.length > 0 && (
                                <span className="ml-2">· {w.monitorNames.slice(0, 3).join(', ')}{w.monitorNames.length > 3 && ` +${w.monitorNames.length - 3}`}</span>
                              )}
                            </p>
                          </div>
                          <div className="flex items-center gap-4 shrink-0 text-right">
                            <div>
                              <p className="text-xs text-zinc-500">Suppressed</p>
                              <p className="text-sm font-bold text-blue-400">{w.suppressedAlerts}</p>
                            </div>
                            <div>
                              <p className="text-xs text-zinc-500">Failure rate</p>
                              <p className="text-sm font-bold text-zinc-300">{w.windowFailurePct}%</p>
                            </div>
                            <div className={`text-zinc-500 transition-transform ${isOpen ? 'rotate-180' : ''}`}>
                              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                              </svg>
                            </div>
                          </div>
                        </div>
                      </button>

                      {isOpen && (
                        <div className="border-t border-zinc-800 px-4 pb-4 pt-3">
                          {w.description && (
                            <p className="text-sm text-zinc-400 mb-3">{w.description}</p>
                          )}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {/* Baseline vs Window */}
                            <div className="space-y-2">
                              <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">Failure Rate Comparison</p>
                              <div>
                                <div className="flex justify-between text-xs text-zinc-500 mb-1">
                                  <span>Baseline (before window)</span>
                                  <span>{w.checksInBaseline} checks</span>
                                </div>
                                <FailureBar pct={w.baselineFailurePct} color="bg-red-600/70" />
                              </div>
                              <div>
                                <div className="flex justify-between text-xs text-zinc-500 mb-1">
                                  <span>During window</span>
                                  <span>{w.checksInWindow} checks</span>
                                </div>
                                <FailureBar pct={w.windowFailurePct} color="bg-orange-500/70" />
                              </div>
                              {w.checksInBaseline === 0 && w.checksInWindow === 0 && (
                                <p className="text-xs text-zinc-500 italic">No check data available for this window&apos;s monitors.</p>
                              )}
                            </div>

                            {/* Recovery + Stats */}
                            <div className="space-y-2">
                              <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">Post-Maintenance</p>
                              <div className="space-y-1.5">
                                <div className="flex justify-between text-sm">
                                  <span className="text-zinc-500">Recovery time</span>
                                  <span className="text-zinc-300">
                                    {w.recoveredAfterMinutes === null ? '—' : `${w.recoveredAfterMinutes}m after window`}
                                  </span>
                                </div>
                                <div className="flex justify-between text-sm">
                                  <span className="text-zinc-500">Failures suppressed</span>
                                  <span className="text-blue-400 font-medium">{w.suppressedAlerts} alerts</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                  <span className="text-zinc-500">Affected monitors</span>
                                  <span className="text-zinc-300">{w.monitorIds.length > 0 ? w.monitorIds.length : 'All'}</span>
                                </div>
                                {w.status === 'over-active' && (
                                  <div className="mt-2 p-2 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
                                    <p className="text-xs text-yellow-400">
                                      💡 No failures detected in baseline or during window. Consider whether this maintenance window is still needed.
                                    </p>
                                  </div>
                                )}
                                {w.status === 'effective' && w.baselineFailurePct > 0 && w.windowFailurePct <= w.baselineFailurePct && (
                                  <div className="mt-2 p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                                    <p className="text-xs text-emerald-400">
                                      ✓ Window effectively suppressed expected maintenance noise.
                                    </p>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </Card>
                  );
                })}
              </div>
            )}

            {/* Info Footer */}
            <Card className="p-4 bg-zinc-900/50">
              <div className="flex items-start gap-3">
                <Shield className="w-4 h-4 text-zinc-500 mt-0.5 shrink-0" />
                <div className="text-xs text-zinc-500 space-y-1">
                  <p><span className="text-zinc-400 font-medium">Effective:</span> Monitor failures were detected — window correctly suppressed alert noise during planned downtime.</p>
                  <p><span className="text-zinc-400 font-medium">Over-scheduled:</span> No failures in either baseline or window period — this window may have been unnecessary.</p>
                  <p><span className="text-zinc-400 font-medium">Noise reduction:</span> Percentage decrease in average failure rate comparing baseline to during-window. Higher is better.</p>
                  <p className="text-zinc-600">Only one-shot (non-recurring) completed windows from the selected period are analyzed.</p>
                </div>
              </div>
            </Card>
          </>
        )}
      </div>
    </AppFrame>
  );
}
