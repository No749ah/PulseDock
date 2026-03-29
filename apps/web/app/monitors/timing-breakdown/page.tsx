'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Clock, RefreshCw, Wifi, Shield, Globe, Download, Zap } from 'lucide-react';
import { AppFrame } from '../../../components/app-frame';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { getUser } from '../../../components/auth';
import { api } from '../../../lib/api';
import { useToast } from '../../../components/ui/toast';

type MonitorTiming = {
  id: string;
  name: string;
  type: string;
  samples: number;
  avgDnsMs: number | null;
  avgTcpMs: number | null;
  avgTlsMs: number | null;
  avgTtfbMs: number | null;
  avgDownloadMs: number | null;
  avgTotalMs: number | null;
  bottleneck: 'dns' | 'tcp' | 'tls' | 'ttfb' | 'download' | null;
  bottleneckPct: number | null;
};

type TimingData = {
  period: { days: number };
  fleet: {
    avgDnsMs: number | null;
    avgTcpMs: number | null;
    avgTlsMs: number | null;
    avgTtfbMs: number | null;
    avgDownloadMs: number | null;
    totalSamples: number;
    bottleneck: 'dns' | 'tcp' | 'tls' | 'ttfb' | 'download' | null;
  };
  monitors: MonitorTiming[];
};

const PHASE_CONFIG = {
  dns: { label: 'DNS', color: 'bg-purple-500', textColor: 'text-purple-400', icon: <Globe className="w-3 h-3" /> },
  tcp: { label: 'TCP', color: 'bg-blue-500', textColor: 'text-blue-400', icon: <Wifi className="w-3 h-3" /> },
  tls: { label: 'TLS', color: 'bg-emerald-500', textColor: 'text-emerald-400', icon: <Shield className="w-3 h-3" /> },
  ttfb: { label: 'TTFB', color: 'bg-yellow-500', textColor: 'text-yellow-400', icon: <Clock className="w-3 h-3" /> },
  download: { label: 'Download', color: 'bg-orange-500', textColor: 'text-orange-400', icon: <Download className="w-3 h-3" /> },
} as const;

type Phase = keyof typeof PHASE_CONFIG;

function formatMs(ms: number | null): string {
  if (ms === null) return '—';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function WaterfallBar({ monitor }: { monitor: MonitorTiming }) {
  const total = monitor.avgTotalMs ?? 1;
  const phases: Array<[Phase, number | null]> = [
    ['dns', monitor.avgDnsMs],
    ['tcp', monitor.avgTcpMs],
    ['tls', monitor.avgTlsMs],
    ['ttfb', monitor.avgTtfbMs],
    ['download', monitor.avgDownloadMs],
  ];
  return (
    <div className="flex h-4 w-full rounded overflow-hidden gap-0.5">
      {phases.map(([phase, ms]) => {
        if (!ms || ms <= 0) return null;
        const pct = Math.max(1, Math.round((ms / total) * 100));
        return (
          <div
            key={phase}
            className={`${PHASE_CONFIG[phase].color} opacity-80 hover:opacity-100 transition-opacity`}
            style={{ width: `${pct}%` }}
            title={`${PHASE_CONFIG[phase].label}: ${formatMs(ms)} (${pct}%)`}
          />
        );
      })}
    </div>
  );
}

export default function TimingBreakdownPage() {
  const router = useRouter();
  const { error: showError } = useToast();
  const [data, setData] = useState<TimingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState(30);
  const [bottleneckFilter, setBottleneckFilter] = useState<Phase | 'all'>('all');

  useEffect(() => {
    const user = getUser();
    if (!user) { router.replace('/login'); return; }
    setLoading(true);
    api<TimingData>(`/v1/monitors/timing-breakdown?days=${period}`, user.id)
      .then(setData)
      .catch(() => showError('Failed to load timing data'))
      .finally(() => setLoading(false));
  }, [period]);

  const filtered = data?.monitors.filter(m =>
    bottleneckFilter === 'all' || m.bottleneck === bottleneckFilter
  ) ?? [];

  return (
    <AppFrame title="HTTP Timing Breakdown">
      <div className="p-6 max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400">
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">HTTP Timing Breakdown</h1>
              <p className="text-sm text-zinc-400">DNS · TCP · TLS · TTFB · Download — where is the time going?</p>
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
            Analyzing timing data...
          </div>
        ) : !data ? null : (
          <>
            {/* Fleet Summary */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {(Object.keys(PHASE_CONFIG) as Phase[]).map(phase => {
                const val = data.fleet[`avg${phase.charAt(0).toUpperCase() + phase.slice(1)}Ms` as keyof typeof data.fleet] as number | null;
                const cfg = PHASE_CONFIG[phase];
                const isBottleneck = data.fleet.bottleneck === phase;
                return (
                  <Card
                    key={phase}
                    className={`p-3 cursor-pointer transition-all hover:ring-1 hover:ring-zinc-600 ${bottleneckFilter === phase ? 'ring-1 ring-zinc-500' : ''} ${isBottleneck ? 'ring-1 ring-yellow-500/50' : ''}`}
                    onClick={() => setBottleneckFilter(bottleneckFilter === phase ? 'all' : phase)}
                  >
                    <div className={`flex items-center gap-1 text-xs ${cfg.textColor} mb-1`}>
                      {cfg.icon}
                      {cfg.label}
                      {isBottleneck && <span className="ml-auto text-yellow-400">⚠</span>}
                    </div>
                    <p className={`text-lg font-bold ${val !== null ? cfg.textColor : 'text-zinc-500'}`}>
                      {formatMs(val)}
                    </p>
                  </Card>
                );
              })}
              <Card className="p-3">
                <p className="text-xs text-zinc-400 mb-1">Samples</p>
                <p className="text-lg font-bold text-white">{data.fleet.totalSamples.toLocaleString()}</p>
              </Card>
            </div>

            {/* Phase Legend */}
            <div className="flex flex-wrap items-center gap-4">
              {(Object.keys(PHASE_CONFIG) as Phase[]).map(phase => (
                <div key={phase} className="flex items-center gap-1.5 text-xs">
                  <div className={`w-3 h-3 rounded-sm ${PHASE_CONFIG[phase].color}`} />
                  <span className={PHASE_CONFIG[phase].textColor}>{PHASE_CONFIG[phase].label}</span>
                </div>
              ))}
            </div>

            {/* Monitor Table */}
            <Card className="overflow-hidden">
              <div className="px-4 py-3 border-b border-zinc-800 flex items-center justify-between">
                <h3 className="text-sm font-semibold text-zinc-300">Per-Monitor Timing</h3>
                <span className="text-xs text-zinc-500">{filtered.length} monitors</span>
              </div>
              {filtered.length === 0 ? (
                <div className="text-center py-12 text-zinc-500">
                  <Clock className="w-10 h-10 mx-auto mb-3 opacity-40" />
                  <p className="text-sm">No timing data found. Timing data requires HTTP monitors with timings enabled.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-zinc-800">
                        <th className="text-left px-4 py-3 text-zinc-400 font-medium">Monitor</th>
                        <th className="text-left px-4 py-3 text-zinc-400 font-medium">Waterfall</th>
                        <th className="text-right px-4 py-3 text-zinc-400 font-medium">DNS</th>
                        <th className="text-right px-4 py-3 text-zinc-400 font-medium">TCP</th>
                        <th className="text-right px-4 py-3 text-zinc-400 font-medium">TLS</th>
                        <th className="text-right px-4 py-3 text-zinc-400 font-medium">TTFB</th>
                        <th className="text-right px-4 py-3 text-zinc-400 font-medium">DL</th>
                        <th className="text-right px-4 py-3 text-zinc-400 font-medium">Total</th>
                        <th className="text-right px-4 py-3 text-zinc-400 font-medium">Bottleneck</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map(m => (
                        <tr
                          key={m.id}
                          className="border-b border-zinc-800/50 hover:bg-zinc-800/30 transition-colors cursor-pointer"
                          onClick={() => router.push(`/monitors/${m.id}`)}
                        >
                          <td className="px-4 py-3">
                            <span className="text-zinc-200 font-medium">{m.name}</span>
                            <p className="text-xs text-zinc-500 mt-0.5">{m.samples} samples</p>
                          </td>
                          <td className="px-4 py-3 w-40">
                            <WaterfallBar monitor={m} />
                          </td>
                          <td className="px-4 py-3 text-right font-mono text-xs text-purple-400">{formatMs(m.avgDnsMs)}</td>
                          <td className="px-4 py-3 text-right font-mono text-xs text-blue-400">{formatMs(m.avgTcpMs)}</td>
                          <td className="px-4 py-3 text-right font-mono text-xs text-emerald-400">{formatMs(m.avgTlsMs)}</td>
                          <td className="px-4 py-3 text-right font-mono text-xs text-yellow-400">{formatMs(m.avgTtfbMs)}</td>
                          <td className="px-4 py-3 text-right font-mono text-xs text-orange-400">{formatMs(m.avgDownloadMs)}</td>
                          <td className="px-4 py-3 text-right font-mono text-sm font-medium text-zinc-200">{formatMs(m.avgTotalMs)}</td>
                          <td className="px-4 py-3 text-right">
                            {m.bottleneck ? (
                              <span className={`text-xs font-medium ${PHASE_CONFIG[m.bottleneck].textColor}`}>
                                {PHASE_CONFIG[m.bottleneck].label}
                                {m.bottleneckPct !== null && <span className="text-zinc-500 ml-1">({m.bottleneckPct}%)</span>}
                              </span>
                            ) : <span className="text-zinc-600">—</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </>
        )}
      </div>
    </AppFrame>
  );
}
