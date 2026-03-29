'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Settings,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  CheckCircle,
  Clock,
  Zap,
  ExternalLink,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react';
import { AppFrame } from '../../../components/app-frame';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { getUser } from '../../../components/auth';
import { api } from '../../../lib/api';
import { useToast } from '../../../components/ui/toast';

type MonitorRec = {
  id: string;
  name: string;
  type: string;
  currentIntervalSec: number | null;
  cronExpression: string | null;
  incidents90d: number;
  avgDetectionMinutes: number | null;
  checksPerDay: number;
  recommendation: 'increase' | 'decrease' | 'optimal' | 'new';
  suggestedIntervalSec: number | null;
  reason: string;
};

type OptimizerData = {
  monitors: MonitorRec[];
  summary: { optimal: number; tooFrequent: number; tooInfrequent: number; totalMonitors: number };
};

function formatInterval(sec: number | null): string {
  if (sec === null) return 'cron';
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.round(sec / 60)}m`;
  return `${Math.round(sec / 3600)}h`;
}

const REC_CONFIG = {
  increase: {
    label: 'Too Infrequent',
    bg: 'bg-red-500/10',
    text: 'text-red-400',
    border: 'border-red-500/20',
    icon: <TrendingUp className="w-4 h-4" />,
  },
  decrease: {
    label: 'Too Frequent',
    bg: 'bg-yellow-500/10',
    text: 'text-yellow-400',
    border: 'border-yellow-500/20',
    icon: <TrendingDown className="w-4 h-4" />,
  },
  optimal: {
    label: 'Optimal',
    bg: 'bg-emerald-500/10',
    text: 'text-emerald-400',
    border: 'border-emerald-500/20',
    icon: <CheckCircle className="w-4 h-4" />,
  },
  new: {
    label: 'New',
    bg: 'bg-zinc-700/50',
    text: 'text-zinc-400',
    border: 'border-zinc-600',
    icon: <Clock className="w-4 h-4" />,
  },
} as const;

export default function IntervalOptimizerPage() {
  const router = useRouter();
  const { error: showError, success: showSuccess } = useToast();
  const [data, setData] = useState<OptimizerData | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'increase' | 'decrease' | 'optimal'>('all');
  const [applying, setApplying] = useState<Set<string>>(new Set());
  const [applied, setApplied] = useState<Set<string>>(new Set());
  const [bulkApplying, setBulkApplying] = useState(false);

  const userId = getUser()?.id;

  const loadData = useCallback(() => {
    if (!userId) return;
    setLoading(true);
    api<OptimizerData>('/v1/monitors/interval-optimizer', userId)
      .then(setData)
      .catch(() => showError('Failed to load optimizer data'))
      .finally(() => setLoading(false));
  }, [userId]);

  useEffect(() => {
    const user = getUser();
    if (!user) { router.replace('/login'); return; }
    loadData();
  }, [loadData]);

  const applyRecommendation = useCallback(async (monitorId: string, intervalSec: number) => {
    if (!userId || applying.has(monitorId)) return;
    setApplying(prev => new Set([...prev, monitorId]));
    try {
      await api(`/v1/monitors/${monitorId}`, userId, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ intervalSec }),
      });
      setApplied(prev => new Set([...prev, monitorId]));
      showSuccess('Interval updated');
      // Update local data optimistically
      setData(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          monitors: prev.monitors.map(m =>
            m.id === monitorId
              ? { ...m, currentIntervalSec: intervalSec, recommendation: 'optimal' as const, suggestedIntervalSec: null }
              : m,
          ),
          summary: {
            ...prev.summary,
            tooFrequent: Math.max(0, prev.summary.tooFrequent - 1),
            tooInfrequent: Math.max(0, prev.summary.tooInfrequent - 1),
            optimal: prev.summary.optimal + 1,
          },
        };
      });
    } catch {
      showError('Failed to apply recommendation');
    } finally {
      setApplying(prev => { const s = new Set(prev); s.delete(monitorId); return s; });
    }
  }, [userId, applying, showSuccess, showError]);

  const applyAllRecommendations = useCallback(async () => {
    if (!data || !userId || bulkApplying) return;
    const actionable = data.monitors.filter(
      m => (m.recommendation === 'increase' || m.recommendation === 'decrease') && m.suggestedIntervalSec !== null,
    );
    if (actionable.length === 0) return;

    setBulkApplying(true);
    let successCount = 0;
    let failCount = 0;

    for (const m of actionable) {
      if (m.suggestedIntervalSec === null) continue;
      try {
        await api(`/v1/monitors/${m.id}`, userId, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ intervalSec: m.suggestedIntervalSec }),
        });
        setApplied(prev => new Set([...prev, m.id]));
        successCount++;
      } catch {
        failCount++;
      }
    }

    setBulkApplying(false);
    if (successCount > 0) {
      showSuccess(`Applied ${successCount} recommendation${successCount > 1 ? 's' : ''}`);
      loadData(); // Reload fresh data
    }
    if (failCount > 0) {
      showError(`${failCount} update${failCount > 1 ? 's' : ''} failed`);
    }
  }, [data, userId, bulkApplying, showSuccess, showError, loadData]);

  const filtered = data?.monitors.filter(m => filter === 'all' || m.recommendation === filter) ?? [];
  const actionableCount = data?.monitors.filter(
    m => (m.recommendation === 'increase' || m.recommendation === 'decrease') && m.suggestedIntervalSec !== null && !applied.has(m.id),
  ).length ?? 0;

  return (
    <AppFrame title="Interval Optimizer">
      <div className="p-6 max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400">
              <Settings className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">Check Interval Optimizer</h1>
              <p className="text-sm text-zinc-400">Data-driven recommendations based on incident history &amp; detection time</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="ghost"
              size="sm"
              onClick={loadData}
              disabled={loading}
              aria-label="Refresh recommendations"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
            {actionableCount > 0 && (
              <Button
                size="sm"
                onClick={applyAllRecommendations}
                disabled={bulkApplying}
                className="bg-emerald-600 hover:bg-emerald-500 text-white"
              >
                {bulkApplying ? (
                  <><RefreshCw className="w-4 h-4 animate-spin mr-1.5" />Applying…</>
                ) : (
                  <><Zap className="w-4 h-4 mr-1.5" />Apply All ({actionableCount})</>
                )}
              </Button>
            )}
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-24 text-zinc-500">
            <RefreshCw className="w-6 h-6 animate-spin mr-2" />
            Analyzing check intervals…
          </div>
        ) : !data ? null : (
          <>
            {/* Summary Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[
                { label: 'Total Monitors', value: data.summary.totalMonitors, color: 'text-white', key: 'all' as const },
                { label: 'Optimal', value: data.summary.optimal, color: 'text-emerald-400', key: 'optimal' as const },
                { label: 'Too Frequent', value: data.summary.tooFrequent, color: 'text-yellow-400', key: 'decrease' as const },
                { label: 'Too Infrequent', value: data.summary.tooInfrequent, color: 'text-red-400', key: 'increase' as const },
              ].map(({ label, value, color, key }) => (
                <Card
                  key={label}
                  className={`p-4 cursor-pointer transition-all hover:ring-1 hover:ring-zinc-600 ${filter === key ? 'ring-1 ring-zinc-500' : ''}`}
                  onClick={() => setFilter(filter === key ? 'all' : key)}
                >
                  <p className="text-xs text-zinc-400 uppercase tracking-wide">{label}</p>
                  <p className={`text-2xl font-bold mt-1 ${color}`}>{value}</p>
                </Card>
              ))}
            </div>

            {/* Methodology note */}
            <div className="flex items-start gap-2 p-3 bg-zinc-800/40 rounded-lg text-xs text-zinc-400 border border-zinc-700/50">
              <AlertTriangle className="w-4 h-4 shrink-0 text-zinc-500 mt-0.5" />
              <span>
                Recommendations are based on 90-day incident history and average detection times.
                Monitors with frequent incidents are flagged as <span className="text-red-400">too infrequent</span>;
                those with no incidents and very high check rates are flagged as <span className="text-yellow-400">too frequent</span>.
                New monitors (&lt;7 days) have no recommendation yet.
              </span>
            </div>

            {/* Monitor List */}
            <div className="space-y-3">
              {filtered.length === 0 ? (
                <Card className="p-8 text-center text-zinc-500">
                  <CheckCircle className="w-10 h-10 mx-auto mb-3 opacity-40" />
                  <p className="text-sm">All monitors have optimal check intervals.</p>
                </Card>
              ) : (
                filtered.map(m => {
                  const cfg = REC_CONFIG[m.recommendation];
                  const isApplying = applying.has(m.id);
                  const isApplied = applied.has(m.id);
                  const canApply = (m.recommendation === 'increase' || m.recommendation === 'decrease')
                    && m.suggestedIntervalSec !== null
                    && !isApplied;

                  return (
                    <Card
                      key={m.id}
                      className={`p-4 border ${cfg.border} transition-colors ${isApplied ? 'opacity-70' : ''}`}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <button
                              type="button"
                              onClick={() => router.push(`/monitors/${m.id}`)}
                              className="text-zinc-200 font-medium truncate hover:text-white hover:underline text-left"
                            >
                              {m.name}
                            </button>
                            <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded ${cfg.bg} ${cfg.text} shrink-0`}>
                              {isApplied ? <CheckCircle2 className="w-4 h-4" /> : cfg.icon}
                              {isApplied ? 'Applied' : cfg.label}
                            </span>
                          </div>
                          <p className="text-xs text-zinc-400">{m.reason}</p>
                          <div className="flex items-center gap-4 mt-2 text-xs text-zinc-500 flex-wrap">
                            <span>Current: <span className="text-zinc-300">{formatInterval(m.currentIntervalSec)}</span></span>
                            <span>Checks/day: <span className="text-zinc-300">{m.checksPerDay}</span></span>
                            <span>Incidents (90d): <span className={m.incidents90d > 0 ? 'text-red-400' : 'text-zinc-300'}>{m.incidents90d}</span></span>
                            {m.avgDetectionMinutes !== null && (
                              <span>Avg detection: <span className="text-zinc-300">{m.avgDetectionMinutes}m</span></span>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-3 shrink-0">
                          {m.suggestedIntervalSec !== null && (
                            <div className="text-right">
                              <p className="text-xs text-zinc-400">Suggested</p>
                              <p className={`text-lg font-bold ${cfg.text}`}>{formatInterval(m.suggestedIntervalSec)}</p>
                            </div>
                          )}
                          <div className="flex flex-col gap-1.5">
                            {canApply && (
                              <Button
                                size="sm"
                                variant="ghost"
                                disabled={isApplying}
                                onClick={() => applyRecommendation(m.id, m.suggestedIntervalSec!)}
                                className="text-xs border border-zinc-600 hover:border-zinc-500 hover:bg-zinc-700"
                                title={`Apply: set interval to ${formatInterval(m.suggestedIntervalSec)}`}
                              >
                                {isApplying ? (
                                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <><Zap className="w-3.5 h-3.5 mr-1" />Apply</>
                                )}
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => router.push(`/monitors/${m.id}`)}
                              className="text-xs text-zinc-500 hover:text-zinc-300"
                            >
                              <ExternalLink className="w-3.5 h-3.5 mr-1" />View
                            </Button>
                          </div>
                        </div>
                      </div>
                    </Card>
                  );
                })
              )}
            </div>
          </>
        )}
      </div>
    </AppFrame>
  );
}
