'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Calendar,
  CheckCircle2,
  Clock,
  RefreshCw,
  TrendingUp,
  Zap,
} from 'lucide-react';
import { AppFrame } from '../../../components/app-frame';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { Table, TableHead, TableBody, TableRow, TableCell } from '../../components/Table';
import { getUser } from '../../../components/auth';
import { api } from '../../../lib/api';
import { useToast } from '../../../components/ui/toast';
import Link from 'next/link';

interface HourBucket {
  hour: number;
  label: string;
  estimatedChecks: number;
}

interface ScheduleMonitor {
  id: string;
  name: string;
  type: string;
  enabled: boolean;
  intervalSec: number;
  cronExpression: string | null;
  checksPerHour: number;
  lastCheckedAt: string | null;
  nextCheckEstimateSec: number | null;
}

interface CheckSchedule {
  generatedAt: string;
  summary: {
    totalMonitors: number;
    enabledMonitors: number;
    fleetChecksPerHour: number;
    fleetChecksPerDay: number;
    peakHour: number;
    peakHourLoad: number;
    quietHour: number;
    quietHourLoad: number;
    avgChecksPerHour: number;
  };
  hourlyLoad: HourBucket[];
  monitors: ScheduleMonitor[];
}

function fmtInterval(sec: number): string {
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.round(sec / 60)}m`;
  if (sec < 86400) return `${Math.round(sec / 3600)}h`;
  return `${Math.round(sec / 86400)}d`;
}

function fmtCountdown(sec: number | null): string {
  if (sec === null) return '—';
  if (sec <= 0) return 'Now';
  if (sec < 60) return `${sec}s`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m ${sec % 60}s`;
  return `${Math.floor(sec / 3600)}h`;
}

function HeatBar({ load, maxLoad }: { load: number; maxLoad: number }) {
  const pct = maxLoad > 0 ? (load / maxLoad) : 0;
  const color =
    pct >= 0.9 ? 'bg-red-500' :
    pct >= 0.7 ? 'bg-orange-500' :
    pct >= 0.5 ? 'bg-yellow-500' :
    'bg-green-500';
  return (
    <div className="flex items-end gap-px h-8">
      <div
        className={`w-full rounded-sm transition-all ${color}`}
        style={{ height: `${Math.max(4, Math.round(pct * 32))}px` }}
        title={`${load} checks/hr`}
      />
    </div>
  );
}

export default function CheckSchedulePage() {
  const [data, setData] = useState<CheckSchedule | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const { error: showError } = useToast();

  const load = useCallback(async () => {
    try {
      setLoading(true);
      await getUser();
      const result = await api<CheckSchedule>('/v1/monitors/check-schedule');
      setData(result);
    } catch {
      showError('Failed to load check schedule');
    } finally {
      setLoading(false);
    }
  }, [showError]);

  useEffect(() => { load(); }, [load]);

  const filtered = data?.monitors.filter((m) =>
    !search || m.name.toLowerCase().includes(search.toLowerCase()) || m.type.toLowerCase().includes(search.toLowerCase())
  ) ?? [];

  const maxLoad = data ? Math.max(...data.hourlyLoad.map((h) => h.estimatedChecks), 1) : 1;

  if (loading && !data) {
    return (
      <AppFrame title="Check Schedule">
        <div className="flex items-center justify-center min-h-[60vh]">
          <RefreshCw className="w-8 h-8 animate-spin text-accent" />
        </div>
      </AppFrame>
    );
  }

  return (
    <AppFrame title="Check Schedule">
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold text-zinc-100">Check Schedule</h1>
            <p className="text-sm text-zinc-400 mt-1">
              Fleet-level check scheduling overview — load distribution and timing
            </p>
          </div>
          <Button onClick={load} disabled={loading} variant="secondary" size="sm">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

        {/* Summary Cards */}
        {data && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Card className="flex items-center gap-3 p-4">
              <Activity className="w-6 h-6 text-accent shrink-0" />
              <div>
                <p className="text-2xl font-bold text-zinc-100 tabular-nums">{data.summary.enabledMonitors}</p>
                <p className="text-xs text-zinc-400">Active monitors</p>
              </div>
            </Card>
            <Card className="flex items-center gap-3 p-4">
              <Zap className="w-6 h-6 text-blue-400 shrink-0" />
              <div>
                <p className="text-2xl font-bold text-zinc-100 tabular-nums">
                  {data.summary.fleetChecksPerHour.toFixed(1)}
                </p>
                <p className="text-xs text-zinc-400">Checks / hour</p>
              </div>
            </Card>
            <Card className="flex items-center gap-3 p-4">
              <TrendingUp className="w-6 h-6 text-orange-400 shrink-0" />
              <div>
                <p className="text-2xl font-bold text-zinc-100 tabular-nums">{data.summary.fleetChecksPerDay.toLocaleString()}</p>
                <p className="text-xs text-zinc-400">Checks / day</p>
              </div>
            </Card>
            <Card className="flex items-center gap-3 p-4">
              <AlertTriangle className="w-6 h-6 text-yellow-400 shrink-0" />
              <div>
                <p className="text-2xl font-bold text-zinc-100 tabular-nums">{data.summary.peakHourLoad.toFixed(1)}</p>
                <p className="text-xs text-zinc-400">Peak hour ({String(data.summary.peakHour).padStart(2, '0')}:00 UTC)</p>
              </div>
            </Card>
          </div>
        )}

        {/* Hourly Load Heatmap */}
        {data && (
          <Card className="p-5">
            <div className="flex items-center gap-2 mb-4">
              <Calendar className="w-5 h-5 text-accent" />
              <h2 className="text-sm font-semibold text-zinc-200">Hourly Check Distribution (UTC)</h2>
              <span className="ml-auto text-xs text-zinc-500">
                Peak: {String(data.summary.peakHour).padStart(2, '0')}:00 UTC ({data.summary.peakHourLoad.toFixed(1)}/hr)
              </span>
            </div>
            <div className="flex items-end gap-1 h-20">
              {data.hourlyLoad.map((h) => (
                <div key={h.hour} className="flex-1 flex flex-col items-center gap-1">
                  <HeatBar load={h.estimatedChecks} maxLoad={maxLoad} />
                  <span className="text-[9px] text-zinc-600 tabular-nums">
                    {String(h.hour).padStart(2, '0')}
                  </span>
                </div>
              ))}
            </div>
            <div className="flex justify-between mt-2 text-xs text-zinc-600">
              <span>00:00 UTC</span>
              <span className="text-zinc-500">← Hour of day (UTC) →</span>
              <span>23:00 UTC</span>
            </div>
          </Card>
        )}

        {/* Load Distribution Insight */}
        {data && data.summary.peakHourLoad > data.summary.avgChecksPerHour * 2 && (
          <div className="flex items-start gap-3 bg-yellow-900/20 border border-yellow-700/40 rounded-xl px-4 py-3 text-sm text-yellow-300">
            <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold">Scheduling hotspot detected</span>
              <span className="text-yellow-400/80"> — Peak hour ({String(data.summary.peakHour).padStart(2, '0')}:00 UTC) has {data.summary.peakHourLoad.toFixed(1)} checks vs {data.summary.avgChecksPerHour.toFixed(1)} avg. Consider staggering check intervals to reduce burst load.</span>
            </div>
          </div>
        )}

        {/* Monitor List */}
        <Card className="overflow-hidden p-0">
          <div className="px-5 py-3 border-b border-border flex items-center gap-3">
            <h2 className="text-sm font-semibold text-zinc-200 flex-1">Monitor Check Rates</h2>
            <input
              type="text"
              placeholder="Search monitors…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="text-sm bg-surface-elevated border border-border rounded-lg px-3 py-1.5 text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-accent w-48"
            />
          </div>
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3 text-zinc-500">
              <Clock className="w-10 h-10" />
              <p className="text-sm">{data?.monitors.length === 0 ? 'No monitors yet.' : 'No results matching search.'}</p>
            </div>
          ) : (
            <Table>
              <TableHead>
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider">Monitor</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider hidden sm:table-cell">Interval</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-zinc-500 uppercase tracking-wider hidden md:table-cell">Cron</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-zinc-500 uppercase tracking-wider">Checks/hr</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-zinc-500 uppercase tracking-wider hidden sm:table-cell">Next check</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-zinc-500 uppercase tracking-wider hidden md:table-cell">Status</th>
                </tr>
              </TableHead>
              <TableBody>
                {filtered
                  .sort((a, b) => b.checksPerHour - a.checksPerHour)
                  .map((m) => (
                    <TableRow key={m.id}>
                      <TableCell>
                        <Link href={`/monitors/${m.id}`} className="hover:text-accent transition-colors">
                          <p className="text-zinc-100 font-medium text-sm">{m.name}</p>
                          <p className="text-xs text-zinc-500">{m.type}</p>
                        </Link>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        <span className="text-zinc-300 font-mono text-sm">{fmtInterval(m.intervalSec)}</span>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        {m.cronExpression ? (
                          <span className="text-xs font-mono bg-surface-elevated text-zinc-300 px-2 py-0.5 rounded border border-border">
                            {m.cronExpression}
                          </span>
                        ) : (
                          <span className="text-zinc-600 text-xs">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <span className={`font-mono font-semibold text-sm ${m.checksPerHour > 30 ? 'text-orange-400' : m.checksPerHour > 10 ? 'text-yellow-400' : 'text-zinc-300'}`}>
                          {m.checksPerHour.toFixed(1)}
                        </span>
                      </TableCell>
                      <TableCell className="text-right hidden sm:table-cell">
                        <span className={`text-xs font-mono ${m.nextCheckEstimateSec === 0 ? 'text-green-400' : 'text-zinc-400'}`}>
                          {fmtCountdown(m.nextCheckEstimateSec)}
                        </span>
                      </TableCell>
                      <TableCell className="text-center hidden md:table-cell">
                        {m.enabled ? (
                          <CheckCircle2 className="w-4 h-4 text-green-400 mx-auto" />
                        ) : (
                          <span className="text-xs text-zinc-600 bg-zinc-800 px-2 py-0.5 rounded">Disabled</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          )}
        </Card>

        {data && (
          <p className="text-xs text-zinc-600 text-right">
            Generated {new Date(data.generatedAt).toLocaleString()} · All times UTC
          </p>
        )}
      </div>
    </AppFrame>
  );
}
