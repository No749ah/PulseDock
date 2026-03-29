'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  Bell,
  BellOff,
  CheckCircle2,
  Info,
  Lightbulb,
  TrendingDown,
  Volume2,
  VolumeX,
  Zap,
} from 'lucide-react';
import { AppFrame } from '../../../components/app-frame';
import { Card } from '../../components/Card';
import { Badge } from '../../components/Badge';
import { Button } from '../../components/Button';
import { Table, TableHead, TableBody, TableRow, TableCell, TableHeader } from '../../components/Table';
import { getUser } from '../../../components/auth';
import { api } from '../../../lib/api';
import { useToast } from '../../../components/ui/toast';

// ─── Types ────────────────────────────────────────────────────────────────────

interface NoiseMonitor {
  monitorId: string;
  monitorName: string;
  monitorType: string;
  totalAlerts: number;
  failedDeliveries: number;
  alertsPerDay: number;
  noiseScore: 'low' | 'medium' | 'high' | 'critical';
  noiseReason: string[];
  recommendations: string[];
  currentConfig: {
    confirmations: number;
    flapDetection: boolean;
    intervalSec: number;
    retryCount: number;
  };
}

interface NoiseAnalysis {
  summary: {
    totalAlerts: number;
    uniqueMonitors: number;
    noisyMonitors: number;
    noisyPercent: number;
    avgAlertsPerMonitor: number;
    topNoisyCount: number;
  };
  monitors: NoiseMonitor[];
  periodDays: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function noiseScoreConfig(score: NoiseMonitor['noiseScore']) {
  switch (score) {
    case 'critical': return { label: 'Critical', className: 'bg-red-500/15 text-red-400 border border-red-500/30', icon: <Zap className="w-3 h-3" /> };
    case 'high':     return { label: 'High',     className: 'bg-orange-500/15 text-orange-400 border border-orange-500/30', icon: <Volume2 className="w-3 h-3" /> };
    case 'medium':   return { label: 'Medium',   className: 'bg-yellow-500/15 text-yellow-400 border border-yellow-500/30', icon: <AlertTriangle className="w-3 h-3" /> };
    case 'low':      return { label: 'Low',      className: 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30', icon: <CheckCircle2 className="w-3 h-3" /> };
  }
}

function NoiseBadge({ score }: { score: NoiseMonitor['noiseScore'] }) {
  const cfg = noiseScoreConfig(score);
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.className}`}>
      {cfg.icon}
      {cfg.label}
    </span>
  );
}

function StatCard({
  title, value, sub, icon, highlight,
}: {
  title: string;
  value: string | number;
  sub?: string;
  icon: React.ReactNode;
  highlight?: 'red' | 'yellow' | 'green' | 'blue';
}) {
  const highlightClass = {
    red: 'border-red-500/30',
    yellow: 'border-yellow-500/30',
    green: 'border-emerald-500/30',
    blue: 'border-blue-500/30',
    undefined: 'border-white/10',
  }[highlight ?? 'undefined'];

  return (
    <Card className={`p-5 border ${highlightClass}`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-white/50 mb-1">{title}</p>
          <p className="text-2xl font-bold text-white">{value}</p>
          {sub && <p className="text-xs text-white/40 mt-1">{sub}</p>}
        </div>
        <div className="text-white/30">{icon}</div>
      </div>
    </Card>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AlertNoisePage() {
  const router = useRouter();
  const { error: showError } = useToast();
  const [data, setData] = useState<NoiseAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [periodDays, setPeriodDays] = useState(7);

  useEffect(() => {
    const user = getUser();
    if (!user) { router.push('/login'); return; }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodDays]);

  async function load() {
    setLoading(true);
    try {
      const data = await api<NoiseAnalysis>(`/v1/alert-channels/noise-analysis?days=${periodDays}`);
      setData(data);
    } catch {
      showError('Failed to load noise analysis');
    } finally {
      setLoading(false);
    }
  }

  function toggleExpand(id: string) {
    setExpanded(expanded === id ? null : id);
  }

  return (
    <AppFrame title="Alert Noise Analysis">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              <VolumeX className="w-6 h-6 text-orange-400" />
              Alert Noise Analysis
            </h1>
            <p className="text-white/50 mt-1 text-sm">
              Identify noisy monitors and reduce alert fatigue with actionable recommendations.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-white/40">Period:</span>
            {[7, 14, 30].map((d) => (
              <button
                key={d}
                onClick={() => setPeriodDays(d)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  periodDays === d
                    ? 'bg-white/15 text-white'
                    : 'text-white/50 hover:text-white hover:bg-white/10'
                }`}
              >
                {d}d
              </button>
            ))}
          </div>
        </div>

        {/* Summary cards */}
        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-24 rounded-xl bg-white/5 animate-pulse" />
            ))}
          </div>
        ) : data && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <StatCard
              title="Total Alerts Fired"
              value={data.summary.totalAlerts.toLocaleString()}
              sub={`in last ${periodDays} days`}
              icon={<Bell className="w-5 h-5" />}
            />
            <StatCard
              title="Noisy Monitors"
              value={data.summary.noisyMonitors}
              sub={`${data.summary.noisyPercent}% of fleet`}
              icon={<Volume2 className="w-5 h-5" />}
              highlight={data.summary.noisyMonitors > 0 ? 'red' : 'green'}
            />
            <StatCard
              title="Avg Alerts / Monitor"
              value={data.summary.avgAlertsPerMonitor}
              sub="across monitored period"
              icon={<TrendingDown className="w-5 h-5" />}
              highlight={data.summary.avgAlertsPerMonitor > 10 ? 'yellow' : undefined}
            />
            <StatCard
              title="Top Monitor Alerts"
              value={data.summary.topNoisyCount}
              sub="highest single monitor"
              icon={<Zap className="w-5 h-5" />}
              highlight={data.summary.topNoisyCount > 50 ? 'red' : undefined}
            />
          </div>
        )}

        {/* No data state */}
        {!loading && data && data.monitors.length === 0 && (
          <Card className="p-12 text-center">
            <BellOff className="w-10 h-10 text-white/20 mx-auto mb-3" />
            <p className="text-white/60 font-medium">No alert deliveries in the last {periodDays} days</p>
            <p className="text-white/30 text-sm mt-1">
              Configure alert channels and let some monitors run to see noise analysis.
            </p>
          </Card>
        )}

        {/* Monitor list */}
        {!loading && data && data.monitors.length > 0 && (
          <Card className="overflow-hidden">
            <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-white">Monitor Noise Ranking</h2>
              <span className="text-xs text-white/40">{data.monitors.length} monitors with alerts</span>
            </div>
            <Table>
              <TableHead>
                <TableRow>
                  <TableHeader>Monitor</TableHeader>
                  <TableHeader>Noise</TableHeader>
                  <TableHeader className="hidden sm:table-cell">Total Alerts</TableHeader>
                  <TableHeader className="hidden md:table-cell">Alerts/Day</TableHeader>
                  <TableHeader className="hidden lg:table-cell">Config</TableHeader>
                  <TableHeader>Details</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {data.monitors.map((m) => (
                  <>
                    <TableRow
                      key={m.monitorId}
                      className="cursor-pointer hover:bg-white/5"
                      onClick={() => toggleExpand(m.monitorId)}
                    >
                      <TableCell>
                        <div>
                          <p className="text-sm font-medium text-white truncate max-w-[160px]">{m.monitorName}</p>
                          <p className="text-xs text-white/40">{m.monitorType}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <NoiseBadge score={m.noiseScore} />
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        <span className="text-sm text-white">{m.totalAlerts.toLocaleString()}</span>
                        {m.failedDeliveries > 0 && (
                          <span className="text-xs text-red-400 ml-1">({m.failedDeliveries} failed)</span>
                        )}
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <span className={`text-sm font-medium ${
                          m.alertsPerDay > 20 ? 'text-red-400' :
                          m.alertsPerDay > 10 ? 'text-orange-400' :
                          m.alertsPerDay > 3 ? 'text-yellow-400' :
                          'text-emerald-400'
                        }`}>
                          {m.alertsPerDay}/day
                        </span>
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs text-white/40">
                            {m.currentConfig.confirmations}× confirm
                          </span>
                          {m.currentConfig.flapDetection && (
                            <Badge variant="default" className="text-xs">Flap ✓</Badge>
                          )}
                          <span className="text-xs text-white/40">
                            {m.currentConfig.intervalSec}s
                          </span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <button
                          className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1"
                          onClick={(e) => { e.stopPropagation(); toggleExpand(m.monitorId); }}
                        >
                          {expanded === m.monitorId ? 'Hide' : 'View'} →
                        </button>
                      </TableCell>
                    </TableRow>

                    {expanded === m.monitorId && (
                      <TableRow key={`${m.monitorId}-detail`}>
                        <TableCell colSpan={6} className="bg-white/[0.03] p-0">
                          <div className="p-5 space-y-4">

                            {/* Noise reasons */}
                            {m.noiseReason.length > 0 && (
                              <div>
                                <p className="text-xs font-semibold text-white/60 mb-2 uppercase tracking-wide flex items-center gap-1">
                                  <AlertTriangle className="w-3 h-3" /> Why it&apos;s noisy
                                </p>
                                <ul className="space-y-1">
                                  {m.noiseReason.map((r, i) => (
                                    <li key={i} className="text-sm text-orange-300/80 flex items-start gap-2">
                                      <span className="text-orange-500 mt-0.5">•</span>
                                      {r}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}

                            {/* Recommendations */}
                            <div>
                              <p className="text-xs font-semibold text-white/60 mb-2 uppercase tracking-wide flex items-center gap-1">
                                <Lightbulb className="w-3 h-3" /> Recommendations
                              </p>
                              <ul className="space-y-1">
                                {m.recommendations.map((r, i) => (
                                  <li key={i} className="text-sm text-emerald-300/80 flex items-start gap-2">
                                    <span className="text-emerald-500 mt-0.5">→</span>
                                    {r}
                                  </li>
                                ))}
                              </ul>
                            </div>

                            {/* Current config */}
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                              {[
                                { label: 'Confirmations', value: `${m.currentConfig.confirmations}×` },
                                { label: 'Flap Detection', value: m.currentConfig.flapDetection ? '✓ Enabled' : '✗ Disabled' },
                                { label: 'Check Interval', value: `${m.currentConfig.intervalSec}s` },
                                { label: 'Retry Count', value: `${m.currentConfig.retryCount}×` },
                              ].map(({ label, value }) => (
                                <div key={label} className="bg-white/5 rounded-lg p-3">
                                  <p className="text-xs text-white/40 mb-0.5">{label}</p>
                                  <p className="text-sm font-medium text-white">{value}</p>
                                </div>
                              ))}
                            </div>

                            <div className="flex gap-2">
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => router.push(`/monitors/${m.monitorId}`)}
                              >
                                View Monitor
                              </Button>
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => router.push(`/monitors/${m.monitorId}/edit`)}
                              >
                                Edit Settings
                              </Button>
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => router.push(`/monitors/${m.monitorId}?tab=simulate`)}
                              >
                                Simulate Alerts
                              </Button>
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                  </>
                ))}
              </TableBody>
            </Table>
          </Card>
        )}

        {/* Info callout */}
        <Card className="p-4 border border-blue-500/20 bg-blue-500/5">
          <div className="flex items-start gap-3">
            <Info className="w-4 h-4 text-blue-400 mt-0.5 flex-shrink-0" />
            <div className="text-sm text-white/60">
              <span className="text-white/80 font-medium">How noise is calculated: </span>
              Monitors with &gt;3 alerts/day are Medium, &gt;10 are High, &gt;20 are Critical.
              Recommendations are generated based on current configuration gaps.
              Use the Simulate Alerts tool to preview the impact of configuration changes before applying them.
            </div>
          </div>
        </Card>
      </div>
    </AppFrame>
  );
}
