'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Settings, RefreshCw, TrendingUp, TrendingDown, CheckCircle, Clock } from 'lucide-react';
import { AppFrame } from '../../../components/app-frame';
import { Card } from '../../components/Card';
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
  increase: { label: 'Too Infrequent', bg: 'bg-red-500/10', text: 'text-red-400', border: 'border-red-500/20', icon: <TrendingUp className="w-4 h-4" /> },
  decrease: { label: 'Too Frequent', bg: 'bg-yellow-500/10', text: 'text-yellow-400', border: 'border-yellow-500/20', icon: <TrendingDown className="w-4 h-4" /> },
  optimal: { label: 'Optimal', bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/20', icon: <CheckCircle className="w-4 h-4" /> },
  new: { label: 'New', bg: 'bg-zinc-700/50', text: 'text-zinc-400', border: 'border-zinc-600', icon: <Clock className="w-4 h-4" /> },
} as const;

export default function IntervalOptimizerPage() {
  const router = useRouter();
  const { error: showError } = useToast();
  const [data, setData] = useState<OptimizerData | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'increase' | 'decrease' | 'optimal'>('all');

  useEffect(() => {
    const user = getUser();
    if (!user) { router.replace('/login'); return; }
    api<OptimizerData>('/v1/monitors/interval-optimizer', user.id)
      .then(setData)
      .catch(() => showError('Failed to load optimizer data'))
      .finally(() => setLoading(false));
  }, []);

  const filtered = data?.monitors.filter(m => filter === 'all' || m.recommendation === filter) ?? [];

  return (
    <AppFrame title="Interval Optimizer">
      <div className="p-6 max-w-5xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400">
            <Settings className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Check Interval Optimizer</h1>
            <p className="text-sm text-zinc-400">Data-driven recommendations for optimal check frequency</p>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-24 text-zinc-500">
            <RefreshCw className="w-6 h-6 animate-spin mr-2" />
            Analyzing check intervals...
          </div>
        ) : !data ? null : (
          <>
            {/* Summary */}
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

            {/* Monitor List */}
            <div className="space-y-3">
              {filtered.length === 0 ? (
                <Card className="p-8 text-center text-zinc-500">
                  <CheckCircle className="w-10 h-10 mx-auto mb-3 opacity-40" />
                  <p className="text-sm">All monitors have optimal check intervals.</p>
                </Card>
              ) : filtered.map(m => {
                const cfg = REC_CONFIG[m.recommendation];
                return (
                  <Card
                    key={m.id}
                    className={`p-4 border ${cfg.border} cursor-pointer hover:bg-zinc-800/30 transition-colors`}
                    onClick={() => router.push(`/monitors/${m.id}`)}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-zinc-200 font-medium truncate">{m.name}</span>
                          <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded ${cfg.bg} ${cfg.text}`}>
                            {cfg.icon}
                            {cfg.label}
                          </span>
                        </div>
                        <p className="text-xs text-zinc-400">{m.reason}</p>
                        <div className="flex items-center gap-4 mt-2 text-xs text-zinc-500">
                          <span>Current: <span className="text-zinc-300">{formatInterval(m.currentIntervalSec)}</span></span>
                          <span>Checks/day: <span className="text-zinc-300">{m.checksPerDay}</span></span>
                          <span>Incidents (90d): <span className={m.incidents90d > 0 ? 'text-red-400' : 'text-zinc-300'}>{m.incidents90d}</span></span>
                          {m.avgDetectionMinutes !== null && (
                            <span>Avg detection: <span className="text-zinc-300">{m.avgDetectionMinutes}m</span></span>
                          )}
                        </div>
                      </div>
                      {m.suggestedIntervalSec !== null && (
                        <div className="text-right shrink-0">
                          <p className="text-xs text-zinc-400">Suggested</p>
                          <p className={`text-lg font-bold ${cfg.text}`}>{formatInterval(m.suggestedIntervalSec)}</p>
                        </div>
                      )}
                    </div>
                  </Card>
                );
              })}
            </div>
          </>
        )}
      </div>
    </AppFrame>
  );
}
