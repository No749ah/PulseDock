'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Circle,
  RefreshCw,
  Activity,
  Globe,
  Monitor,
  Server,
  Cpu,
  ChevronUp,
  ChevronDown,
  Edit2,
  X,
  Check,
} from 'lucide-react';
import { AppFrame } from '../../../components/app-frame';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { Table, TableHead, TableBody, TableRow, TableCell } from '../../components/Table';
import { getUser } from '../../../components/auth';
import { api } from '../../../lib/api';
import { useToast } from '../../../components/ui/toast';

// ─── Types ────────────────────────────────────────────────────────────────────

type MonthlyHistory = {
  month: string; // "2026-01"
  uptimePct: number;
  compliant: boolean | null;
};

type SlaMonitor = {
  id: string;
  name: string;
  type: string;
  folder: string | null;
  slaTarget: number | null;
  uptimePct: number;
  compliant: boolean | null;
  errorBudgetUsedPct: number | null;
  budgetRemainingPct: number | null;
  totalRuns: number;
  failedRuns: number;
  monthlyHistory: MonthlyHistory[];
};

type SlaDashboard = {
  generatedAt: string;
  period: { start: string; end: string };
  summary: {
    totalMonitors: number;
    compliant: number;
    atRisk: number;
    breached: number;
    noTarget: number;
    currentMonth: string;
  };
  monitors: SlaMonitor[];
};

type SortKey = 'name' | 'uptimePct' | 'errorBudgetUsedPct' | 'compliant';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const SLA_PRESETS = [99.0, 99.5, 99.9, 99.95, 99.99];

function monitorTypeIcon(type: string) {
  switch (type?.toUpperCase()) {
    case 'HTTP': return <Globe className="w-4 h-4 text-blue-400 shrink-0" />;
    case 'TCP': return <Server className="w-4 h-4 text-purple-400 shrink-0" />;
    case 'DNS': return <Activity className="w-4 h-4 text-cyan-400 shrink-0" />;
    case 'PING': return <Cpu className="w-4 h-4 text-orange-400 shrink-0" />;
    default: return <Monitor className="w-4 h-4 text-zinc-400 shrink-0" />;
  }
}

function complianceStatus(m: SlaMonitor): 'compliant' | 'atRisk' | 'breached' | 'noTarget' {
  if (m.slaTarget == null) return 'noTarget';
  if (m.compliant === false) return 'breached';
  if (m.compliant === true && m.uptimePct - m.slaTarget < 0.1) return 'atRisk';
  return 'compliant';
}

function UptimeColor({ m }: { m: SlaMonitor }) {
  const status = complianceStatus(m);
  const cls =
    status === 'compliant' ? 'text-green-400' :
    status === 'atRisk' ? 'text-yellow-400' :
    status === 'breached' ? 'text-red-400' :
    'text-zinc-400';
  return <span className={`font-mono font-semibold ${cls}`}>{m.uptimePct.toFixed(4)}%</span>;
}

function BudgetBar({ used }: { used: number | null }) {
  if (used == null) return <span className="text-zinc-500 text-sm">—</span>;
  const color = used >= 90 ? 'bg-red-500' : used >= 50 ? 'bg-yellow-500' : 'bg-green-500';
  return (
    <div className="flex items-center gap-2 min-w-[120px]">
      <div className="flex-1 bg-surface-elevated rounded-full h-2 overflow-hidden">
        <div className={`h-2 rounded-full transition-all ${color}`} style={{ width: `${Math.min(100, used)}%` }} />
      </div>
      <span className="text-xs font-mono text-zinc-300 w-12 text-right">{used.toFixed(1)}%</span>
    </div>
  );
}

function MonthBadge({ h }: { h: MonthlyHistory }) {
  const monthLabel = h.month.slice(5); // "01", "02"
  const color =
    h.compliant === null ? 'bg-zinc-700 text-zinc-400' :
    h.compliant ? 'bg-green-900/50 text-green-400 border border-green-700/50' :
    'bg-red-900/50 text-red-400 border border-red-700/50';
  return (
    <span className={`inline-flex flex-col items-center px-2 py-1 rounded text-[10px] font-mono ${color}`}>
      <span className="font-bold">{monthLabel}</span>
      <span>{h.uptimePct.toFixed(2)}%</span>
    </span>
  );
}

function SlaTargetPill({
  monitor,
  onSave,
}: {
  monitor: SlaMonitor;
  onSave: (id: string, value: number) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [preset, setPreset] = useState<number | 'custom'>(monitor.slaTarget ?? 99.9);
  const [customValue, setCustomValue] = useState<string>(monitor.slaTarget?.toFixed(2) ?? '99.90');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    const value = preset === 'custom' ? parseFloat(customValue) : preset;
    if (isNaN(value) || value < 0.1 || value > 100) return;
    setSaving(true);
    try {
      await onSave(monitor.id, value);
      setOpen(false);
    } finally {
      setSaving(false);
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-mono transition-colors ${
          monitor.slaTarget != null
            ? 'bg-blue-900/40 text-blue-300 border border-blue-700/40 hover:bg-blue-900/70'
            : 'bg-zinc-800 text-zinc-400 border border-zinc-700 hover:bg-zinc-700'
        }`}
      >
        <Edit2 className="w-3 h-3" />
        {monitor.slaTarget != null ? `${monitor.slaTarget}%` : 'Set Target'}
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-2 p-3 bg-surface-elevated border border-zinc-700 rounded-lg shadow-xl z-10 w-52">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-zinc-300">SLA Target</span>
        <button onClick={() => setOpen(false)} className="text-zinc-500 hover:text-zinc-300">
          <X className="w-3 h-3" />
        </button>
      </div>
      <div className="flex flex-wrap gap-1">
        {SLA_PRESETS.map((p) => (
          <button
            key={p}
            onClick={() => setPreset(p)}
            className={`px-2 py-1 rounded text-xs font-mono transition-colors ${
              preset === p ? 'bg-accent text-white' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
            }`}
          >
            {p}%
          </button>
        ))}
        <button
          onClick={() => setPreset('custom')}
          className={`px-2 py-1 rounded text-xs transition-colors ${
            preset === 'custom' ? 'bg-accent text-white' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
          }`}
        >
          Custom
        </button>
      </div>
      {preset === 'custom' && (
        <input
          type="number"
          min={0.1}
          max={100}
          step={0.01}
          value={customValue}
          onChange={(e) => setCustomValue(e.target.value)}
          className="w-full px-2 py-1 rounded bg-zinc-900 border border-zinc-700 text-xs font-mono text-zinc-100 focus:outline-none focus:border-accent"
          placeholder="e.g. 99.95"
        />
      )}
      <Button size="sm" onClick={handleSave} disabled={saving} className="w-full">
        {saving ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
        Save
      </Button>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function SlaPage() {
  const [data, setData] = useState<SlaDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const { success: showSuccess } = useToast();

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      await getUser();
      const result = await api<SlaDashboard>('/v1/monitors/sla-dashboard');
      setData(result);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Failed to load SLA dashboard';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSetTarget = async (id: string, value: number) => {
    try {
      const u = await getUser();
      await api(`/v1/monitors/${id}`, u?.id, {
        method: 'PATCH',
        body: JSON.stringify({ slaTarget: value }),
      });
      showSuccess('SLA target updated');
      await load();
    } catch {
      showSuccess('Failed to update SLA target');
    }
  };

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('asc'); }
  };

  const SortIcon = ({ k }: { k: SortKey }) => {
    if (sortKey !== k) return <ChevronUp className="w-3 h-3 text-zinc-600" />;
    return sortDir === 'asc'
      ? <ChevronUp className="w-3 h-3 text-accent" />
      : <ChevronDown className="w-3 h-3 text-accent" />;
  };

  const sortedMonitors = data
    ? [...data.monitors].sort((a, b) => {
        let cmp = 0;
        if (sortKey === 'name') cmp = a.name.localeCompare(b.name);
        else if (sortKey === 'uptimePct') cmp = a.uptimePct - b.uptimePct;
        else if (sortKey === 'errorBudgetUsedPct')
          cmp = (a.errorBudgetUsedPct ?? -1) - (b.errorBudgetUsedPct ?? -1);
        else if (sortKey === 'compliant') {
          const statusOrder = { breached: 0, atRisk: 1, noTarget: 2, compliant: 3 };
          cmp = statusOrder[complianceStatus(a)] - statusOrder[complianceStatus(b)];
        }
        return sortDir === 'asc' ? cmp : -cmp;
      })
    : [];

  const period = data
    ? `${new Date(data.period.start).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}`
    : '—';

  return (
    <AppFrame title="SLA Dashboard">
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold text-zinc-100">SLA Dashboard</h1>
            <p className="text-sm text-zinc-400 mt-1">
              Service Level Agreement compliance across all monitors · {period}
            </p>
          </div>
          <Button onClick={load} disabled={loading} variant="secondary" size="sm">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

        {error && (
          <div className="bg-red-900/20 border border-red-700/50 rounded-lg px-4 py-3 text-red-400 text-sm">
            {error}
          </div>
        )}

        {/* Summary Cards */}
        {data && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Card className="flex items-center gap-3 p-4">
              <CheckCircle2 className="w-6 h-6 text-green-400 shrink-0" />
              <div>
                <p className="text-2xl font-bold text-zinc-100">{data.summary.compliant}</p>
                <p className="text-xs text-zinc-400">Compliant</p>
              </div>
            </Card>
            <Card className="flex items-center gap-3 p-4">
              <AlertTriangle className="w-6 h-6 text-yellow-400 shrink-0" />
              <div>
                <p className="text-2xl font-bold text-zinc-100">{data.summary.atRisk}</p>
                <p className="text-xs text-zinc-400">At Risk</p>
              </div>
            </Card>
            <Card className="flex items-center gap-3 p-4">
              <XCircle className="w-6 h-6 text-red-400 shrink-0" />
              <div>
                <p className="text-2xl font-bold text-zinc-100">{data.summary.breached}</p>
                <p className="text-xs text-zinc-400">Breached</p>
              </div>
            </Card>
            <Card className="flex items-center gap-3 p-4">
              <Circle className="w-6 h-6 text-zinc-500 shrink-0" />
              <div>
                <p className="text-2xl font-bold text-zinc-100">{data.summary.noTarget}</p>
                <p className="text-xs text-zinc-400">No Target</p>
              </div>
            </Card>
          </div>
        )}

        {/* Table */}
        <Card className="overflow-hidden p-0">
          {loading && !data ? (
            <div className="flex items-center justify-center py-16">
              <RefreshCw className="w-6 h-6 animate-spin text-accent" />
            </div>
          ) : sortedMonitors.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-zinc-500">
              <Circle className="w-10 h-10" />
              <p className="text-sm">No monitors found.</p>
              <p className="text-xs text-zinc-600">Enable monitors and set SLA targets to see compliance data.</p>
            </div>
          ) : (
            <Table>
              <TableHead>
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wider">
                    <button onClick={() => toggleSort('name')} className="flex items-center gap-1 hover:text-zinc-100 transition-colors">
                      Monitor <SortIcon k="name" />
                    </button>
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wider">SLA Target</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wider">
                    <button onClick={() => toggleSort('uptimePct')} className="flex items-center gap-1 hover:text-zinc-100 transition-colors">
                      Uptime % <SortIcon k="uptimePct" />
                    </button>
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wider">
                    <button onClick={() => toggleSort('errorBudgetUsedPct')} className="flex items-center gap-1 hover:text-zinc-100 transition-colors">
                      Error Budget <SortIcon k="errorBudgetUsedPct" />
                    </button>
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wider">Last 3 Months</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-text-secondary uppercase tracking-wider">
                    <button onClick={() => toggleSort('compliant')} className="flex items-center gap-1 hover:text-zinc-100 transition-colors">
                      Status <SortIcon k="compliant" />
                    </button>
                  </th>
                </tr>
              </TableHead>
              <TableBody>
                {sortedMonitors.map((m) => {
                  const status = complianceStatus(m);
                  return (
                    <TableRow key={m.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {monitorTypeIcon(m.type)}
                          <div>
                            <p className="text-zinc-100 font-medium text-sm">{m.name}</p>
                            <p className="text-xs text-zinc-500">{m.type}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <SlaTargetPill monitor={m} onSave={handleSetTarget} />
                      </TableCell>
                      <TableCell>
                        <div>
                          <UptimeColor m={m} />
                          <p className="text-[10px] text-zinc-500 mt-0.5">{m.totalRuns} runs · {m.failedRuns} failed</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <BudgetBar used={m.errorBudgetUsedPct} />
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          {m.monthlyHistory.map((h) => (
                            <MonthBadge key={h.month} h={h} />
                          ))}
                        </div>
                      </TableCell>
                      <TableCell>
                        {status === 'compliant' && (
                          <span className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold bg-success/20 text-success border border-success/30">
                            <CheckCircle2 className="w-3 h-3" /> Compliant
                          </span>
                        )}
                        {status === 'atRisk' && (
                          <span className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold bg-warning/20 text-warning border border-warning/30">
                            <AlertTriangle className="w-3 h-3" /> At Risk
                          </span>
                        )}
                        {status === 'breached' && (
                          <span className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold bg-danger/20 text-danger border border-danger/30">
                            <XCircle className="w-3 h-3" /> Breached
                          </span>
                        )}
                        {status === 'noTarget' && (
                          <span className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold bg-zinc-800 text-zinc-400 border border-zinc-700">
                            <Circle className="w-3 h-3" /> No Target
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </Card>

        {data && (
          <p className="text-xs text-zinc-600 text-right">
            Generated {new Date(data.generatedAt).toLocaleString()}
          </p>
        )}
      </div>
    </AppFrame>
  );
}
