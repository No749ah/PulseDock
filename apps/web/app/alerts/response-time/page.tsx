'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Zap, RefreshCw, CheckCircle, Clock } from 'lucide-react';
import { AppFrame } from '../../../components/app-frame';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { getUser } from '../../../components/auth';
import { api } from '../../../lib/api';
import { useToast } from '../../../components/ui/toast';

type ChannelStats = {
  channelId: string;
  channelName: string;
  channelType: string;
  totalDeliveries: number;
  successCount: number;
  failedCount: number;
  successRate: number;
  avgMs: number | null;
  p50Ms: number | null;
  p95Ms: number | null;
  maxMs: number | null;
};

type DayStats = {
  date: string;
  count: number;
  successCount: number;
  avgMs: number | null;
};

type ResponseTimeData = {
  period: { days: number };
  channels: ChannelStats[];
  fleetStats: {
    avgMs: number | null;
    p50Ms: number | null;
    p95Ms: number | null;
    totalDeliveries: number;
    successRate: number;
  };
  dailyTrend: DayStats[];
};

function formatMs(ms: number | null): string {
  if (ms === null) return '—';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function latencyColor(ms: number | null): string {
  if (ms === null) return 'text-zinc-400';
  if (ms < 1000) return 'text-emerald-400';
  if (ms < 5000) return 'text-yellow-400';
  return 'text-red-400';
}

function formatDate(d: string): string {
  const parts = d.split('-');
  return `${parts[1]}/${parts[2]}`;
}

export default function AlertResponseTimePage() {
  const router = useRouter();
  const { error: showError } = useToast();
  const [data, setData] = useState<ResponseTimeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState(30);

  useEffect(() => {
    const user = getUser();
    if (!user) { router.replace('/login'); return; }
    setLoading(true);
    api<ResponseTimeData>(`/v1/alerts/response-time?days=${period}`, user.id)
      .then(setData)
      .catch(() => showError('Failed to load response time data'))
      .finally(() => setLoading(false));
  }, [period]);

  const maxDailyCount = Math.max(1, ...(data?.dailyTrend.map(d => d.count) ?? [0]));

  return (
    <AppFrame title="Alert Response Time">
      <div className="p-6 max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-yellow-500/10 text-yellow-400">
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">Alert Response Time</h1>
              <p className="text-sm text-zinc-400">How fast do alerts get delivered after a monitor fails?</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {[7, 14, 30, 60, 90].map(d => (
              <Button key={d} variant={period === d ? 'primary' : 'ghost'} size="sm" onClick={() => setPeriod(d)}>
                {d}d
              </Button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-24 text-zinc-500">
            <RefreshCw className="w-6 h-6 animate-spin mr-2" />
            Loading response time data...
          </div>
        ) : !data ? null : (
          <>
            {/* Fleet Summary */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
              <Card className="p-4">
                <p className="text-xs text-zinc-400 uppercase tracking-wide flex items-center gap-1">
                  <Clock className="w-3 h-3" /> Avg
                </p>
                <p className={`text-2xl font-bold mt-1 ${latencyColor(data.fleetStats.avgMs)}`}>
                  {formatMs(data.fleetStats.avgMs)}
                </p>
              </Card>
              <Card className="p-4">
                <p className="text-xs text-zinc-400 uppercase tracking-wide">P50</p>
                <p className={`text-2xl font-bold mt-1 ${latencyColor(data.fleetStats.p50Ms)}`}>
                  {formatMs(data.fleetStats.p50Ms)}
                </p>
              </Card>
              <Card className="p-4">
                <p className="text-xs text-zinc-400 uppercase tracking-wide">P95</p>
                <p className={`text-2xl font-bold mt-1 ${latencyColor(data.fleetStats.p95Ms)}`}>
                  {formatMs(data.fleetStats.p95Ms)}
                </p>
              </Card>
              <Card className="p-4">
                <p className="text-xs text-zinc-400 uppercase tracking-wide flex items-center gap-1">
                  <CheckCircle className="w-3 h-3 text-emerald-400" /> Success Rate
                </p>
                <p className={`text-2xl font-bold mt-1 ${data.fleetStats.successRate >= 95 ? 'text-emerald-400' : data.fleetStats.successRate >= 80 ? 'text-yellow-400' : 'text-red-400'}`}>
                  {data.fleetStats.successRate}%
                </p>
              </Card>
              <Card className="p-4">
                <p className="text-xs text-zinc-400 uppercase tracking-wide">Total Deliveries</p>
                <p className="text-2xl font-bold text-white mt-1">{data.fleetStats.totalDeliveries}</p>
              </Card>
            </div>

            {/* Per-Channel Stats */}
            <Card className="overflow-hidden">
              <div className="px-4 py-3 border-b border-zinc-800">
                <h3 className="text-sm font-semibold text-zinc-300">Per-Channel Response Times</h3>
              </div>
              {data.channels.length === 0 ? (
                <div className="text-center py-12 text-zinc-500">
                  <Zap className="w-10 h-10 mx-auto mb-3 opacity-40" />
                  <p className="text-sm">No alert deliveries in this period.</p>
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-zinc-800">
                      <th className="text-left px-4 py-3 text-zinc-400 font-medium">Channel</th>
                      <th className="text-right px-4 py-3 text-zinc-400 font-medium">Deliveries</th>
                      <th className="text-right px-4 py-3 text-zinc-400 font-medium">Success</th>
                      <th className="text-right px-4 py-3 text-zinc-400 font-medium">Avg</th>
                      <th className="text-right px-4 py-3 text-zinc-400 font-medium">P50</th>
                      <th className="text-right px-4 py-3 text-zinc-400 font-medium">P95</th>
                      <th className="text-right px-4 py-3 text-zinc-400 font-medium">Max</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.channels.map(c => (
                      <tr key={c.channelId} className="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors">
                        <td className="px-4 py-3">
                          <div>
                            <span className="text-zinc-200 font-medium">{c.channelName}</span>
                            <span className="ml-2 text-xs text-zinc-500 capitalize">{c.channelType}</span>
                          </div>
                          <div className="flex items-center gap-1 mt-1">
                            <div className="w-full max-w-32 bg-zinc-800 rounded-full h-1">
                              <div
                                className={`h-1 rounded-full ${c.successRate >= 95 ? 'bg-emerald-500' : c.successRate >= 80 ? 'bg-yellow-400' : 'bg-red-500'}`}
                                style={{ width: `${c.successRate}%` }}
                              />
                            </div>
                            <span className="text-xs text-zinc-500">{c.successRate}%</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-right text-zinc-300">{c.totalDeliveries}</td>
                        <td className="px-4 py-3 text-right">
                          <span className="text-emerald-400">{c.successCount}</span>
                          {c.failedCount > 0 && <span className="text-red-400 ml-1">/ {c.failedCount} fail</span>}
                        </td>
                        <td className={`px-4 py-3 text-right font-mono ${latencyColor(c.avgMs)}`}>{formatMs(c.avgMs)}</td>
                        <td className={`px-4 py-3 text-right font-mono ${latencyColor(c.p50Ms)}`}>{formatMs(c.p50Ms)}</td>
                        <td className={`px-4 py-3 text-right font-mono ${latencyColor(c.p95Ms)}`}>{formatMs(c.p95Ms)}</td>
                        <td className={`px-4 py-3 text-right font-mono ${latencyColor(c.maxMs)}`}>{formatMs(c.maxMs)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>

            {/* Daily Trend */}
            {data.dailyTrend.length > 0 && (
              <Card className="p-4">
                <h3 className="text-sm font-semibold text-zinc-300 mb-4">Daily Delivery Trend</h3>
                <div className="overflow-x-auto">
                  <div className="flex items-end gap-1 h-24">
                    {data.dailyTrend.map(d => {
                      const barH = d.count === 0 ? 0 : Math.max(3, Math.round((d.count / maxDailyCount) * 88));
                      const successRate = d.count > 0 ? d.successCount / d.count : 1;
                      const color = successRate >= 0.95 ? 'bg-emerald-500/70' : successRate >= 0.8 ? 'bg-yellow-400/70' : 'bg-red-500/70';
                      return (
                        <div key={d.date} className="flex flex-col items-center gap-0.5 group" style={{ minWidth: 12 }}>
                          <div className="relative">
                            {barH > 0 && (
                              <div
                                className={`w-3 rounded-sm ${color} hover:opacity-100 opacity-80 transition-opacity`}
                                style={{ height: barH }}
                                title={`${d.date}: ${d.count} deliveries, avg ${formatMs(d.avgMs)}`}
                              />
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex gap-1 mt-1">
                    {data.dailyTrend.map((d, i) => (
                      <div key={d.date} className="text-center" style={{ minWidth: 12, fontSize: '8px', color: '#52525b' }}>
                        {i % 7 === 0 ? formatDate(d.date) : ''}
                      </div>
                    ))}
                  </div>
                </div>
              </Card>
            )}
          </>
        )}
      </div>
    </AppFrame>
  );
}
